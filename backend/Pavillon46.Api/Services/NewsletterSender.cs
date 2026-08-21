using System.Diagnostics.CodeAnalysis;
using System.Net;
using System.Text;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;
using SendGrid;
using SendGrid.Helpers.Mail;

namespace Pavillon46.Api.Services;

public interface INewsletterSender
{
    /// <summary>Bulk-send a newsletter. If <paramref name="testEmails"/> is
    /// non-empty, only those addresses receive a copy, the audit lands in
    /// <c>LastTestSend</c> and the newsletter's stored status is unchanged.
    /// Otherwise the full active, non-opt-out member base receives the
    /// newsletter and the row is flipped to "sent" on first successful send.
    /// <para>
    /// The caller's <paramref name="ct"/> only guards the reads that happen
    /// before any mail exists. Once dispatch starts it is deliberately ignored:
    /// a client disconnect must never leave recipients mailed with no audit.
    /// Addresses are expected pre-validated by the controller — this method does
    /// not decide test-vs-real on the caller's behalf beyond "is the list
    /// non-empty".
    /// </para></summary>
    Task<NewsletterSendAudit> SendAsync(
        string newsletterId,
        string adminId,
        IReadOnlyList<string>? testEmails,
        CancellationToken ct);

    /// <summary>Re-send a newsletter to the recipients recorded as failed by a
    /// previous real send. <paramref name="failedRecipientTokens"/> holds member
    /// ids (older audits stored email addresses, which are still matched) and is
    /// re-filtered through the same eligibility gate as a full send, so a member
    /// who has since unsubscribed or been deactivated is skipped. Members who
    /// already received the issue are never touched: they are not in the
    /// list.</summary>
    Task<NewsletterSendAudit> ResendAsync(
        string newsletterId,
        string adminId,
        IReadOnlyList<string> failedRecipientTokens,
        CancellationToken ct);
}

/// <summary>
/// Bulk newsletter dispatcher. Follows the design's pipeline: load newsletter,
/// bucket recipients by language (test mode uses NewsletterOptions.DefaultTestLanguage),
/// chunk each language group into batches capped by NewsletterOptions.MaxRecipientsPerBatch
/// (SendGrid's own personalization cap is 1000, which we never exceed), send one
/// SendGridMessage per batch with per-recipient substitutions for -firstName-,
/// -greeting-, -unsubscribeUrl-, -subject-, retry once on failure with a small
/// delay, and record every partial failure in a NewsletterSendAudit that also
/// gets persisted back onto the newsletter row.
/// <para>
/// Two invariants hold once dispatch has started: the send is not abortable by
/// the caller (the loop runs on CancellationToken.None), and the audit is
/// written in a finally — including the release of the send claim the controller
/// took before calling in. Anything less leaves recipients mailed with no record
/// and a status that invites a second send.
/// </para>
/// </summary>
public class NewsletterSender : INewsletterSender
{
    private readonly IMemberStore _members;
    private readonly INewsletterStore _newsletters;
    private readonly IUnsubscribeTokenService _tokens;
    private readonly SendGridOptions _sendgrid;
    private readonly SiteOptions _site;
    private readonly NewsletterOptions _newsletterOpts;
    private readonly INewsletterEmailRenderer _renderer;
    private readonly ILogger<NewsletterSender> _logger;

    // Hard cap enforced regardless of config — SendGrid rejects any message
    // with more than 1000 personalizations, so config can shrink but never
    // widen this batch size.
    private const int HardBatchCap = 1000;
    // Errors[] is capped so a runaway upstream cannot bloat storage.
    private const int MaxErrorsRecorded = 20;
    // FailedRecipients[] is capped for the same reason, and harder: the whole
    // newsletter row is serialized into ONE Azure Table "data" property, whose
    // ceiling is 64KB. A broad SendGrid outage used to push every failed address
    // in there, the upsert threw, and the audit was lost along with the status
    // flip — which then invited a duplicate send. FailedTotal keeps the true
    // count; ids (not addresses) keep the row small and less PII-heavy.
    private const int MaxFailedRecipientsRecorded = 200;
    // SendHistory keeps this many real sends, most recent first.
    private const int MaxSendHistory = 10;

    /// <summary>What a dispatch is, for auditing and for how it lands on the row.</summary>
    private enum SendKind
    {
        /// <summary>Full member audience; flips the row to "sent".</summary>
        Full,
        /// <summary>Explicit test addresses; never touches LastSend or Status.</summary>
        Test,
        /// <summary>Retry of a previous real send's failures.</summary>
        Resend,
    }

    public NewsletterSender(
        IMemberStore members,
        INewsletterStore newsletters,
        IUnsubscribeTokenService tokens,
        IOptions<SendGridOptions> sendgrid,
        IOptions<SiteOptions> site,
        IOptions<NewsletterOptions> newsletterOpts,
        INewsletterEmailRenderer renderer,
        ILogger<NewsletterSender> logger)
    {
        _members = members;
        _newsletters = newsletters;
        _tokens = tokens;
        _sendgrid = sendgrid.Value;
        _site = site.Value;
        _newsletterOpts = newsletterOpts.Value;
        _renderer = renderer;
        _logger = logger;
    }

    public Task<NewsletterSendAudit> SendAsync(
        string newsletterId,
        string adminId,
        IReadOnlyList<string>? testEmails,
        CancellationToken ct) =>
        DispatchAsync(
            newsletterId,
            adminId,
            testEmails is { Count: > 0 } ? SendKind.Test : SendKind.Full,
            testEmails,
            null,
            ct);

    public Task<NewsletterSendAudit> ResendAsync(
        string newsletterId,
        string adminId,
        IReadOnlyList<string> failedRecipientTokens,
        CancellationToken ct) =>
        DispatchAsync(newsletterId, adminId, SendKind.Resend, null, failedRecipientTokens, ct);

    private async Task<NewsletterSendAudit> DispatchAsync(
        string newsletterId,
        string adminId,
        SendKind kind,
        IReadOnlyList<string>? testEmails,
        IReadOnlyList<string>? resendTokens,
        CancellationToken ct)
    {
        // Use the shared resolvers rather than the raw options: they trim (an
        // API key pasted into Azure with trailing whitespace is a real failure
        // mode) and fall back FROM_EMAIL → ADMIN_EMAIL, so a single verified
        // sender is enough. Reading the raw properties here would make
        // newsletters the only mail in the app that refuses to send on a deploy
        // where every other email works.
        if (string.IsNullOrWhiteSpace(_sendgrid.ResolvedApiKey()))
            throw new InvalidOperationException("SENDGRID_API_KEY is missing.");
        if (string.IsNullOrWhiteSpace(_sendgrid.ResolvedFromEmail()))
            throw new InvalidOperationException("FROM_EMAIL is missing.");

        var newsletter = await _newsletters.GetByIdAsync(newsletterId, ct)
            ?? throw new InvalidOperationException($"Newsletter {newsletterId} not found.");

        var testMode = kind == SendKind.Test;

        var audit = new NewsletterSendAudit
        {
            SentAt = DateTime.UtcNow.ToString("o"),
            AdminId = adminId,
            TestMode = testMode,
            Kind = KindName(kind),
        };

        // Language buckets: language code → recipient list. Test mode uses one
        // synthesized recipient per email so the personalization pipeline stays
        // uniform (no branching on the loop below).
        var buckets = new Dictionary<string, List<Recipient>>(StringComparer.OrdinalIgnoreCase);

        if (kind == SendKind.Test)
        {
            var lang = NormalizeLang(_newsletterOpts.DefaultTestLanguage);
            var list = new List<Recipient>();
            // The controller already trims, validates and dedupes; this is a
            // defence in depth for any other caller, not the primary gate.
            foreach (var raw in testEmails ?? Array.Empty<string>())
            {
                var email = (raw ?? "").Trim();
                if (string.IsNullOrWhiteSpace(email) || !email.Contains('@')) continue;
                if (list.Any(r => string.Equals(r.Email, email, StringComparison.OrdinalIgnoreCase))) continue;
                list.Add(new Recipient(Id: "test:" + email.ToLowerInvariant(), Email: email, FirstName: "", LastName: "", Title: ""));
            }
            if (list.Count > 0) buckets[lang] = list;
        }
        else
        {
            // Resend targets are matched by member id, and by email as well so
            // audits written before FailedRecipients held ids still resolve.
            HashSet<string>? wanted = null;
            if (kind == SendKind.Resend)
            {
                wanted = new HashSet<string>(
                    (resendTokens ?? Array.Empty<string>())
                        .Where(t => !string.IsNullOrWhiteSpace(t))
                        .Select(t => t.Trim()),
                    StringComparer.OrdinalIgnoreCase);
            }

            var members = await _members.ListAsync(ct);
            foreach (var m in members)
            {
                if (!IsEligibleRecipient(m, out var email)) continue;
                if (wanted is not null && !wanted.Contains(m.Id) && !wanted.Contains(email)) continue;
                var lang = NormalizeLang(m.PreferredLanguage);
                if (!buckets.TryGetValue(lang, out var list))
                {
                    list = new List<Recipient>();
                    buckets[lang] = list;
                }
                list.Add(new Recipient(m.Id, email, m.FirstName ?? "", m.LastName ?? "", m.Title ?? ""));
            }
        }

        audit.TotalRecipients = buckets.Values.Sum(v => v.Count);

        // From here on the audit MUST be written, whatever happens: the finally
        // below is the only thing standing between "recipients were mailed" and
        // "the row still says published, so the admin sends again". It also
        // clears the send claim the controller took before calling us.
        try
        {
            if (audit.TotalRecipients == 0)
            {
                _logger.LogInformation(
                    "Newsletter {NewsletterId} had no recipients (adminId={AdminId} kind={Kind})",
                    newsletter.Id, adminId, audit.Kind);
                return audit;
            }

            // Deliberately NOT the request's token. Once the first batch is
            // handed to SendGrid the send is no longer the HTTP request's to
            // abort: closing the browser tab used to cancel the loop, throw
            // OperationCanceledException past the audit write, and leave
            // recipients mailed with no record and a status still "published".
            var dispatchCt = CancellationToken.None;

            var batchCap = Math.Clamp(_newsletterOpts.MaxRecipientsPerBatch, 1, HardBatchCap);
            var client = new SendGridClient(_sendgrid.ResolvedApiKey());
            var from = new EmailAddress(_sendgrid.ResolvedFromEmail(), _sendgrid.ResolvedFromName());

            foreach (var (lang, list) in buckets)
            {
                var htmlTemplate = BuildHtml(newsletter, lang);
                var plainTemplate = BuildPlain(newsletter, lang);
                var subjectRaw = string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase)
                    ? newsletter.TitleEn
                    : newsletter.TitleFr;

                var offset = 0;
                while (offset < list.Count)
                {
                    var take = Math.Min(batchCap, list.Count - offset);
                    var slice = list.GetRange(offset, take);
                    offset += take;
                    audit.Batches += 1;

                    var template = new BatchTemplate(from, plainTemplate, htmlTemplate);

                    // Recipient ⇄ personalization pairs, kept together so a failing
                    // batch can be bisected without losing the mapping.
                    var accepted = new List<(Recipient Recipient, Personalization Personalization)>();
                    foreach (var r in slice)
                    {
                        // A malformed member row must never fail the whole batch:
                        // the personalization is skipped, the recipient is recorded
                        // as failed, and the loop moves on.
                        try
                        {
                            var personalization = new Personalization
                            {
                                Tos = new List<EmailAddress>
                                {
                                    new(r.Email, $"{r.FirstName} {r.LastName}".Trim()),
                                },
                                // Two token families on purpose. The "-…Html-" values
                                // are HTML-encoded because SendGrid substitution is a
                                // literal string replace into the HTML body — an
                                // unencoded title or member name would otherwise inject
                                // markup into every recipient's inbox. The plain values
                                // feed the Subject header and the text/plain part, where
                                // entities would show up literally, so they are only
                                // header-sanitized (CR/LF stripped) instead.
                                Substitutions = new Dictionary<string, string>
                                {
                                    ["-firstName-"] = SanitizeHeader(r.FirstName),
                                    ["-greeting-"] = SanitizeHeader(BuildGreeting(lang, r.FirstName)),
                                    ["-greetingHtml-"] = WebUtility.HtmlEncode(BuildGreeting(lang, r.FirstName)),
                                    ["-unsubscribeUrl-"] = $"{_site.Origin()}/api/newsletters/unsubscribe?t={_tokens.Create(r.Id)}&lang={lang}",
                                    ["-subject-"] = SanitizeHeader(subjectRaw),
                                    ["-titleHtml-"] = WebUtility.HtmlEncode(subjectRaw),
                                },
                                CustomArgs = new Dictionary<string, string>
                                {
                                    ["newsletterId"] = newsletter.Id,
                                    ["memberId"] = r.Id,
                                    ["lang"] = lang,
                                    ["testMode"] = testMode ? "true" : "false",
                                    ["sendKind"] = audit.Kind,
                                },
                            };
                            accepted.Add((r, personalization));
                        }
                        catch (Exception ex)
                        {
                            RecordFailedRecipient(audit, r);
                            RecordError(audit, $"personalization skipped for {r.Id}: {ex.Message}");
                        }
                    }

                    if (accepted.Count == 0) continue;

                    // Accounting (Sent/Failed) happens inside — the slice may be
                    // bisected, so only the leaves know who actually got through.
                    await SendSliceAsync(client, template, accepted, audit, dispatchCt);
                }
            }

            return audit;
        }
        finally
        {
            // CancellationToken.None on purpose: the audit and the claim release
            // must survive a cancelled request.
            await PersistAuditAsync(newsletter, audit, kind, CancellationToken.None);

            _logger.LogInformation(
                "Newsletter {NewsletterId} send done adminId={AdminId} sent={Sent} failed={Failed} batches={Batches} kind={Kind}",
                newsletter.Id, adminId, audit.Sent, audit.Failed, audit.Batches, audit.Kind);
        }
    }

    /// <summary>The one eligibility gate, shared by a full send and a resend:
    /// active, not opted out, and holding a plausible address. On true,
    /// <paramref name="email"/> is the non-null address — declared with
    /// <c>NotNullWhen</c> so callers get that guarantee from the type system
    /// instead of asserting it with <c>!</c>.</summary>
    private static bool IsEligibleRecipient(Member m, [NotNullWhen(true)] out string? email)
    {
        email = null;
        if (!string.Equals(m.Status, "active", StringComparison.OrdinalIgnoreCase)) return false;
        if (m.NewsletterOptOut) return false;
        if (string.IsNullOrWhiteSpace(m.Email)) return false;
        if (!m.Email.Contains('@')) return false;
        email = m.Email;
        return true;
    }

    private static string KindName(SendKind kind) => kind switch
    {
        SendKind.Test => "test",
        SendKind.Resend => "resend",
        _ => "send",
    };

    /// <summary>
    /// The parts of a batch message that are identical for every recipient.
    /// Held separately so a slice can be re-materialised at any size.
    /// </summary>
    private sealed record BatchTemplate(EmailAddress From, string Plain, string Html);

    private static SendGridMessage BuildMessage(
        BatchTemplate template,
        IEnumerable<Personalization> personalizations) =>
        new()
        {
            From = template.From,
            Subject = "-subject-",
            PlainTextContent = template.Plain,
            HtmlContent = template.Html,
            Personalizations = personalizations.ToList(),
        };

    /// <summary>
    /// Sends one slice, retrying once. If it still fails with a 4xx and the
    /// slice holds more than one recipient, the slice is bisected and each half
    /// retried independently — SendGrid rejects a whole request when a single
    /// address in it is malformed or suppressed, so without this one bad member
    /// row would silently drop the newsletter for every other recipient in the
    /// same batch. Recursion terminates at a single recipient, where a failure
    /// genuinely belongs to that address. Updates audit.Sent / audit.Failed.
    /// </summary>
    private async Task SendSliceAsync(
        SendGridClient client,
        BatchTemplate template,
        List<(Recipient Recipient, Personalization Personalization)> slice,
        NewsletterSendAudit audit,
        CancellationToken ct)
    {
        if (slice.Count == 0) return;

        var msg = BuildMessage(template, slice.Select(p => p.Personalization));
        var (ok, status, detail) = await TrySendOnceWithRetryAsync(client, msg, ct);

        if (ok)
        {
            audit.Sent += slice.Count;
            return;
        }

        // A single recipient cannot be narrowed further, and 5xx / transport
        // failures are not recipient-specific, so bisecting them would only
        // multiply load against an already-failing upstream.
        var isRecipientScoped = status is >= 400 and < 500;
        if (slice.Count == 1 || !isRecipientScoped)
        {
            RecordSliceFailure(audit, slice, status, detail);
            return;
        }

        _logger.LogWarning(
            "Bisecting newsletter batch of {Count} after SendGrid {Status} to isolate the bad recipient(s).",
            slice.Count, status);

        var mid = slice.Count / 2;
        await SendSliceAsync(client, template, slice.GetRange(0, mid), audit, ct);
        await SendSliceAsync(client, template, slice.GetRange(mid, slice.Count - mid), audit, ct);
    }

    /// <summary>Single attempt plus one retry. Never throws.</summary>
    private async Task<(bool Ok, int? Status, string Detail)> TrySendOnceWithRetryAsync(
        SendGridClient client,
        SendGridMessage msg,
        CancellationToken ct)
    {
        for (var attempt = 1; attempt <= 2; attempt++)
        {
            try
            {
                var response = await client.SendEmailAsync(msg, ct);
                if ((int)response.StatusCode < 400) return (true, (int)response.StatusCode, "");

                var body = Truncate(await response.Body.ReadAsStringAsync(ct), 200);
                if (attempt == 2) return (false, (int)response.StatusCode, body);

                _logger.LogWarning(
                    "SendGrid rejected a newsletter batch (attempt {Attempt}): {Status} {Body}",
                    attempt, response.StatusCode, body);
            }
            // No cancellation filter: the dispatch loop runs on
            // CancellationToken.None precisely so a client disconnect cannot
            // abort a send in flight, and an OperationCanceledException escaping
            // here would skip the audit write for everyone already mailed.
            catch (Exception ex)
            {
                if (attempt == 2) return (false, null, ex.Message);
                _logger.LogWarning(ex, "SendGrid newsletter batch threw (attempt {Attempt}).", attempt);
            }

            await Task.Delay(Math.Max(0, _newsletterOpts.RetryDelayMs), ct);
        }

        return (false, null, "exhausted retries");
    }

    private void RecordSliceFailure(
        NewsletterSendAudit audit,
        List<(Recipient Recipient, Personalization Personalization)> slice,
        int? status,
        string message)
    {
        foreach (var (r, _) in slice)
        {
            RecordFailedRecipient(audit, r);
        }

        // Identify the recipient by id in the stored error line — the same
        // reasoning as FailedRecipients: an audit row is not the place for a
        // list of member addresses.
        var who = slice.Count == 1 ? slice[0].Recipient.Id : $"{slice.Count} recipients";
        var reason = status.HasValue
            ? $"batch {audit.Batches} — {who} failed: SendGrid {status.Value} - {Truncate(message, 200)}"
            : $"batch {audit.Batches} — {who} failed: {Truncate(message, 200)}";
        RecordError(audit, reason);
    }

    /// <summary>
    /// Counts one failure. The persisted list keeps member ids and stops at
    /// MaxFailedRecipientsRecorded (FailedTotal still tells the truth); the
    /// uncapped address list is request-scoped and never written to storage.
    /// </summary>
    private static void RecordFailedRecipient(NewsletterSendAudit audit, Recipient r)
    {
        audit.Failed += 1;
        audit.FailedTotal = audit.Failed;
        if (audit.FailedRecipients.Count < MaxFailedRecipientsRecorded)
            audit.FailedRecipients.Add(r.Id);
        audit.FailedRecipientEmails.Add(r.Email);
    }

    private static void RecordError(NewsletterSendAudit audit, string line)
    {
        if (audit.Errors.Count >= MaxErrorsRecorded) return;
        audit.Errors.Add(Truncate(line, 300));
    }

    /// <summary>
    /// Writes the audit onto the newsletter row and releases the send claim.
    /// Runs in a finally, on CancellationToken.None, and swallows storage
    /// failures after one trimmed retry: losing the audit is bad, but losing the
    /// status flip is worse — that is what turns a failed write into a duplicate
    /// send.
    /// </summary>
    private async Task PersistAuditAsync(Newsletter newsletter, NewsletterSendAudit audit, SendKind kind, CancellationToken ct)
    {
        ApplyAudit(newsletter, audit, kind);
        try
        {
            await _newsletters.UpsertAsync(newsletter, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex, "Newsletter {NewsletterId} audit write failed; retrying with a trimmed audit", newsletter.Id);
            try
            {
                ApplyAudit(newsletter, TrimForStorage(audit), kind);
                await _newsletters.UpsertAsync(newsletter, ct);
            }
            catch (Exception retryEx)
            {
                _logger.LogError(
                    retryEx,
                    "Newsletter {NewsletterId} audit write failed permanently — sent={Sent} failed={Failed} kind={Kind}",
                    newsletter.Id, audit.Sent, audit.Failed, audit.Kind);
            }
        }
    }

    /// <summary>
    /// Places the audit on the row. A TEST send only ever touches LastTestSend:
    /// it must not overwrite the record of who really received the issue, nor
    /// the status. A real send (or a resend) updates LastSend, prepends a
    /// compact history entry, and flips the status on first success.
    /// </summary>
    private static void ApplyAudit(Newsletter newsletter, NewsletterSendAudit audit, SendKind kind)
    {
        newsletter.UpdatedAt = DateTime.UtcNow.ToString("o");

        // The dispatch is over either way — drop the claim so the next legitimate
        // send is not blocked until the staleness window expires.
        newsletter.SendClaimedAtUtc = null;
        newsletter.SendClaimedByAdminId = null;

        if (kind == SendKind.Test)
        {
            newsletter.LastTestSend = audit;
            return;
        }

        // A dispatch that found nobody to mail carries no delivery information.
        // Keeping the previous LastSend matters: it is what /resend-failed reads,
        // and a resend whose targets have all since unsubscribed must not erase
        // the list of who originally failed.
        if (audit.TotalRecipients == 0) return;

        newsletter.LastSend = audit;

        newsletter.SendHistory ??= new List<NewsletterSendAudit>();
        // Idempotent: PersistAuditAsync may re-apply the same dispatch with a
        // trimmed audit after a storage failure, and that must replace the entry
        // rather than add a second one for the same send.
        newsletter.SendHistory.RemoveAll(a =>
            string.Equals(a.SentAt, audit.SentAt, StringComparison.Ordinal)
            && string.Equals(a.Kind, audit.Kind, StringComparison.Ordinal));
        newsletter.SendHistory.Insert(0, CompactForHistory(audit));
        if (newsletter.SendHistory.Count > MaxSendHistory)
            newsletter.SendHistory.RemoveRange(MaxSendHistory, newsletter.SendHistory.Count - MaxSendHistory);

        if (audit.Sent > 0)
        {
            newsletter.Status = "sent";
            newsletter.LastSentAt = audit.SentAt;
        }
    }

    /// <summary>Counters-only copy for SendHistory. Ten entries each carrying a
    /// 200-id list would by themselves approach Table Storage's 64KB
    /// per-property ceiling, so only LastSend keeps the recipient list.</summary>
    private static NewsletterSendAudit CompactForHistory(NewsletterSendAudit a) => new()
    {
        SentAt = a.SentAt,
        AdminId = a.AdminId,
        TotalRecipients = a.TotalRecipients,
        Sent = a.Sent,
        Failed = a.Failed,
        FailedTotal = a.FailedTotal > 0 ? a.FailedTotal : a.Failed,
        Batches = a.Batches,
        TestMode = a.TestMode,
        Kind = a.Kind,
        Errors = a.Errors.Take(3).ToList(),
    };

    /// <summary>Last-resort shrink used when the full audit could not be
    /// persisted, so at least the counters and the status flip survive.</summary>
    private static NewsletterSendAudit TrimForStorage(NewsletterSendAudit a)
    {
        var trimmed = CompactForHistory(a);
        trimmed.Errors = new List<string>
        {
            $"audit trimmed: the full record ({a.FailedTotal} failed recipients, {a.Errors.Count} errors) exceeded the storage limit.",
        };
        return trimmed;
    }

    // ------------------- helpers -------------------

    private static string NormalizeLang(string? lang) =>
        string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase) ? "en" : "fr";

    private static string BuildGreeting(string lang, string? firstName)
    {
        var name = (firstName ?? "").Trim();
        if (string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase))
            return string.IsNullOrEmpty(name) ? "Bonjour," : $"Dear {name},";
        return string.IsNullOrEmpty(name) ? "Bonjour," : $"Bonjour {name},";
    }

    private static string Truncate(string s, int max) =>
        string.IsNullOrEmpty(s) ? "" : (s.Length <= max ? s : s[..max]);

    /// <summary>
    /// Makes a value safe to interpolate into an email header (and into the
    /// text/plain part). Strips CR/LF and other control characters so a newline
    /// inside a newsletter title cannot inject additional SMTP headers such as
    /// Bcc:, then collapses runs of whitespace and caps the length.
    /// </summary>
    private static string SanitizeHeader(string? value, int max = 200)
    {
        if (string.IsNullOrEmpty(value)) return "";

        var sb = new StringBuilder(value.Length);
        foreach (var ch in value)
        {
            // Fold every control char (CR, LF, TAB, NUL, …) to a single space.
            sb.Append(char.IsControl(ch) ? ' ' : ch);
        }

        var collapsed = System.Text.RegularExpressions.Regex.Replace(sb.ToString(), @"\s+", " ").Trim();
        return Truncate(collapsed, max);
    }

    // Build the HTML body with SendGrid substitution tokens embedded. The
    // shell matches the dark-green Pavillon 46 transactional style already
    // used for credentials and password-reset emails.
    private string BuildHtml(Newsletter n, string lang)
    {
        var isEn = string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase);
        var logo = _site.Page("images/logo.png");
        var body = isEn ? n.BodyEn : n.BodyFr;
        var year = DateTime.UtcNow.Year;
        var unsubscribeLabel = isEn ? "Unsubscribe" : "Se désabonner";
        var tagHtml = string.IsNullOrWhiteSpace(n.Tag) ? "" : WebUtility.HtmlEncode(n.Tag.Trim().ToUpperInvariant());

        // No cover means NO cover row — not a fallback image. This used to point
        // at images/newsletter-cover-default.jpg, which does not exist in
        // wwwroot/public, so every newsletter sent without a chosen cover put a
        // broken-image placeholder at the top of the mail. An issue with no
        // photograph simply opens on the title.
        //
        // The URL itself is validated as absolute http(s) when it is saved (see
        // AdminNewslettersController's cover check); it is HtmlEncode'd here as
        // well because it lands inside an attribute.
        var coverRow = string.IsNullOrWhiteSpace(n.CoverImageUrl)
            ? ""
            : $@"<tr><td style=""padding:0;background:#fcf8f7;"">
        <img src=""{WebUtility.HtmlEncode(n.CoverImageUrl.Trim())}"" alt="""" width=""600"" style=""display:block;width:100%;max-width:600px;height:auto;""/>
      </td></tr>";

        // Markdown → inline-styled, email-safe HTML. The renderer emits its own
        // tags from a fixed allow-list, encodes every text run and attribute
        // value itself, and refuses any href that is not absolute http/https/
        // mailto — so the fragment below is ALREADY safe HTML and must not be
        // HtmlEncode'd again (a second pass would print literal <p> tags).
        // Everything else interpolated into this template stays encoded.
        var paragraphHtml = _renderer.RenderHtmlFragment(body);

        return $@"<!DOCTYPE html>
<html lang=""{lang}"">
<head><meta charset=""UTF-8""><meta name=""viewport"" content=""width=device-width,initial-scale=1.0""><title>-titleHtml-</title></head>
<body style=""font-family:Jost,sans-serif;color:#1d2b24;background:#0f261d;margin:0;padding:0;"">
  <table role=""presentation"" cellspacing=""0"" cellpadding=""0"" border=""0"" width=""100%"" style=""background:#0f261d;padding:24px 0;""><tr><td align=""center"">
    <table role=""presentation"" cellspacing=""0"" cellpadding=""0"" border=""0"" width=""600"" style=""max-width:600px;margin:0 auto;background:#fcf8f7;border-radius:14px;overflow:hidden;box-shadow:0 18px 48px rgba(0,0,0,0.3);"">
      <tr><td style=""background:linear-gradient(135deg,#265640 0%,#3a6f58 100%);padding:28px 32px 24px;text-align:center;color:#fff;"">
        <img src=""{logo}"" alt=""Pavillon 46"" width=""140"" style=""display:inline-block;max-width:140px;width:100%;height:auto;filter:brightness(0) invert(1);margin-bottom:10px;""/>
        <p style=""margin:0;font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:#c9d8d0;"">{tagHtml}</p>
      </td></tr>
      {coverRow}
      <tr><td style=""padding:32px 32px 8px;"">
        <h1 style=""margin:0 0 18px 0;color:#265640;font-family:Jost,'Helvetica Neue',Arial,sans-serif;font-size:24px;font-weight:400;line-height:1.3;"">-titleHtml-</h1>
        <p style=""margin:0 0 18px 0;font-size:16px;color:#3a4a42;line-height:1.7;"">-greetingHtml-</p>
        {paragraphHtml}
      </td></tr>
      <tr><td style=""padding:24px 32px;background:#f0ece9;border-top:1px solid rgba(38,86,64,0.1);font-size:12px;color:#8a9a92;text-align:center;line-height:1.7;"">
        <p style=""margin:0 0 6px 0;"">© {year} Pavillon 46 — La Croix-sur-Lutry, Suisse</p>
        <p style=""margin:0;""><a href=""-unsubscribeUrl-"" style=""color:#8a9a92;font-size:12px;text-decoration:underline;"">{WebUtility.HtmlEncode(unsubscribeLabel)}</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>";
    }

    // Instance (was static) so it can reach the renderer. The plain part keeps
    // the -subject-/-greeting- tokens — the text/plain substitutions, which are
    // NOT the HTML-encoded -titleHtml-/-greetingHtml- pair used above.
    private string BuildPlain(Newsletter n, string lang)
    {
        var isEn = string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase);
        var body = isEn ? n.BodyEn : n.BodyFr;
        var unsubscribeLabel = isEn ? "Unsubscribe" : "Se désabonner";
        // Markdown stripped to prose: no markup and no HTML entities, which is
        // what text/plain needs — HtmlEncode here would leak &amp; to readers.
        return $"-subject-\n\n-greeting-\n\n{_renderer.RenderPlainText(body)}\n\n---\n{unsubscribeLabel}: -unsubscribeUrl-";
    }

    private sealed record Recipient(string Id, string Email, string FirstName, string LastName, string Title);
}
