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
    /// non-empty, only those addresses receive a copy and the newsletter's
    /// stored status is unchanged. Otherwise the full active, non-opt-out
    /// member base receives the newsletter and the row is flipped to
    /// "sent" on first successful send.</summary>
    Task<NewsletterSendAudit> SendAsync(
        string newsletterId,
        string adminId,
        IReadOnlyList<string>? testEmails,
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
/// </summary>
public class NewsletterSender : INewsletterSender
{
    private readonly IMemberStore _members;
    private readonly INewsletterStore _newsletters;
    private readonly IUnsubscribeTokenService _tokens;
    private readonly SendGridOptions _sendgrid;
    private readonly SiteOptions _site;
    private readonly NewsletterOptions _newsletterOpts;
    private readonly ILogger<NewsletterSender> _logger;

    // Hard cap enforced regardless of config — SendGrid rejects any message
    // with more than 1000 personalizations, so config can shrink but never
    // widen this batch size.
    private const int HardBatchCap = 1000;
    // Errors[] is capped so a runaway upstream cannot bloat storage.
    private const int MaxErrorsRecorded = 20;

    public NewsletterSender(
        IMemberStore members,
        INewsletterStore newsletters,
        IUnsubscribeTokenService tokens,
        IOptions<SendGridOptions> sendgrid,
        IOptions<SiteOptions> site,
        IOptions<NewsletterOptions> newsletterOpts,
        ILogger<NewsletterSender> logger)
    {
        _members = members;
        _newsletters = newsletters;
        _tokens = tokens;
        _sendgrid = sendgrid.Value;
        _site = site.Value;
        _newsletterOpts = newsletterOpts.Value;
        _logger = logger;
    }

    public async Task<NewsletterSendAudit> SendAsync(
        string newsletterId,
        string adminId,
        IReadOnlyList<string>? testEmails,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_sendgrid.ApiKey))
            throw new InvalidOperationException("SENDGRID_API_KEY is missing.");
        if (string.IsNullOrWhiteSpace(_sendgrid.FromEmail))
            throw new InvalidOperationException("FROM_EMAIL is missing.");

        var newsletter = await _newsletters.GetByIdAsync(newsletterId, ct)
            ?? throw new InvalidOperationException($"Newsletter {newsletterId} not found.");

        var testMode = testEmails is { Count: > 0 };

        var audit = new NewsletterSendAudit
        {
            SentAt = DateTime.UtcNow.ToString("o"),
            AdminId = adminId,
            TestMode = testMode,
        };

        // Language buckets: language code → recipient list. Test mode uses one
        // synthesized recipient per email so the personalization pipeline stays
        // uniform (no branching on the loop below).
        var buckets = new Dictionary<string, List<Recipient>>(StringComparer.OrdinalIgnoreCase);

        if (testMode)
        {
            var lang = NormalizeLang(_newsletterOpts.DefaultTestLanguage);
            var list = new List<Recipient>();
            foreach (var raw in testEmails!)
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
            var members = await _members.ListAsync(ct);
            foreach (var m in members)
            {
                if (!string.Equals(m.Status, "active", StringComparison.OrdinalIgnoreCase)) continue;
                if (m.NewsletterOptOut) continue;
                if (string.IsNullOrWhiteSpace(m.Email) || !m.Email.Contains('@')) continue;
                var lang = NormalizeLang(m.PreferredLanguage);
                if (!buckets.TryGetValue(lang, out var list))
                {
                    list = new List<Recipient>();
                    buckets[lang] = list;
                }
                list.Add(new Recipient(m.Id, m.Email, m.FirstName ?? "", m.LastName ?? "", m.Title ?? ""));
            }
        }

        audit.TotalRecipients = buckets.Values.Sum(v => v.Count);
        if (audit.TotalRecipients == 0)
        {
            _logger.LogInformation(
                "Newsletter {NewsletterId} had no recipients (adminId={AdminId} testMode={TestMode})",
                newsletter.Id, adminId, testMode);
            await PersistAuditAsync(newsletter, audit, testMode, ct);
            return audit;
        }

        var batchCap = Math.Clamp(_newsletterOpts.MaxRecipientsPerBatch, 1, HardBatchCap);
        var client = new SendGridClient(_sendgrid.ApiKey);
        var fromName = string.IsNullOrWhiteSpace(_sendgrid.FromName) ? "Pavillon 46" : _sendgrid.FromName;
        var from = new EmailAddress(_sendgrid.FromEmail, fromName);

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
                            },
                        };
                        accepted.Add((r, personalization));
                    }
                    catch (Exception ex)
                    {
                        audit.Failed += 1;
                        audit.FailedRecipients.Add(r.Email);
                        RecordError(audit, $"personalization skipped for {r.Email}: {ex.Message}");
                    }
                }

                if (accepted.Count == 0) continue;

                // Accounting (Sent/Failed) happens inside — the slice may be
                // bisected, so only the leaves know who actually got through.
                await SendSliceAsync(client, template, accepted, audit, ct);
            }
        }

        await PersistAuditAsync(newsletter, audit, testMode, ct);

        _logger.LogInformation(
            "Newsletter {NewsletterId} send done adminId={AdminId} sent={Sent} failed={Failed} batches={Batches} testMode={TestMode}",
            newsletter.Id, adminId, audit.Sent, audit.Failed, audit.Batches, testMode);

        return audit;
    }

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
            catch (Exception ex) when (!ct.IsCancellationRequested)
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
            audit.Failed += 1;
            audit.FailedRecipients.Add(r.Email);
        }

        var who = slice.Count == 1 ? slice[0].Recipient.Email : $"{slice.Count} recipients";
        var reason = status.HasValue
            ? $"batch {audit.Batches} — {who} failed: SendGrid {status.Value} - {Truncate(message, 200)}"
            : $"batch {audit.Batches} — {who} failed: {Truncate(message, 200)}";
        RecordError(audit, reason);
    }

    private static void RecordError(NewsletterSendAudit audit, string line)
    {
        if (audit.Errors.Count >= MaxErrorsRecorded) return;
        audit.Errors.Add(line);
    }

    private async Task PersistAuditAsync(Newsletter newsletter, NewsletterSendAudit audit, bool testMode, CancellationToken ct)
    {
        newsletter.LastSend = audit;
        newsletter.UpdatedAt = DateTime.UtcNow.ToString("o");
        // Real (non-test) send with at least one accepted message flips the
        // newsletter's status to "sent" — the row becomes read-only from then on.
        if (!testMode && audit.Sent > 0)
        {
            newsletter.Status = "sent";
            newsletter.LastSentAt = audit.SentAt;
        }
        await _newsletters.UpsertAsync(newsletter, ct);
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
        var paragraphs = SplitParagraphs(body);
        var year = DateTime.UtcNow.Year;
        var unsubscribeLabel = isEn ? "Unsubscribe" : "Se désabonner";
        var cover = string.IsNullOrWhiteSpace(n.CoverImageUrl)
            ? _site.Page("images/newsletter-cover-default.jpg")
            : n.CoverImageUrl;
        var tagHtml = string.IsNullOrWhiteSpace(n.Tag) ? "" : WebUtility.HtmlEncode(n.Tag.Trim().ToUpperInvariant());

        var paragraphHtml = string.Join(
            "",
            paragraphs.Select(p =>
                $"<p style=\"margin:0 0 18px 0;font-size:16px;color:#3a4a42;line-height:1.7;\">{WebUtility.HtmlEncode(p)}</p>"));

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
      <tr><td style=""padding:0;background:#fcf8f7;"">
        <img src=""{WebUtility.HtmlEncode(cover)}"" alt="""" width=""600"" style=""display:block;width:100%;max-width:600px;height:auto;""/>
      </td></tr>
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

    private static string BuildPlain(Newsletter n, string lang)
    {
        var isEn = string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase);
        var body = isEn ? n.BodyEn : n.BodyFr;
        var unsubscribeLabel = isEn ? "Unsubscribe" : "Se désabonner";
        return $"-subject-\n\n-greeting-\n\n{body}\n\n---\n{unsubscribeLabel}: -unsubscribeUrl-";
    }

    private static IReadOnlyList<string> SplitParagraphs(string body)
    {
        if (string.IsNullOrWhiteSpace(body)) return Array.Empty<string>();
        return body.Split(new[] { "\r\n\r\n", "\n\n" }, StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Trim())
            .Where(p => p.Length > 0)
            .ToList();
    }

    private sealed record Recipient(string Id, string Email, string FirstName, string LastName, string Title);
}
