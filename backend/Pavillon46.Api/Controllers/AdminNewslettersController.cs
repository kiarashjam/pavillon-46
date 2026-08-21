using System.Collections.Concurrent;
using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;
using Pavillon46.Api.Security;
using Pavillon46.Api.Services;

namespace Pavillon46.Api.Controllers;

/// <summary>
/// Admin-only surface for the newsletter module. The class-level
/// <see cref="AdminAuthorizeAttribute"/> gates every action here — list, detail,
/// create, update, delete, publish/unpublish, send, resend-failed and the AI
/// drafter — so nothing on this controller is reachable without a valid admin
/// bearer. Public-facing routes (member listing, unsubscribe) live in
/// <c>MembersController</c> and <c>NewslettersController</c>.
/// <para>
/// State conflicts answer 409 consistently (wrong status for the transition, a
/// send already in progress); 400 is for malformed input; a dispatch that
/// actually ran answers 200 with the audit, even when every message failed.
/// </para>
/// </summary>
[ApiController]
[Route("api/admin/newsletters")]
[AdminAuthorize]
public class AdminNewslettersController : ControllerBase
{
    // Rate-limit bucket name and window for the AI draft endpoint. 20 drafts
    // per hour per admin keeps a runaway UI from burning through Anthropic
    // credits — a human admin will never exhaust that budget by hand.
    private const string AiDraftBucket = "newsletter-ai-draft";
    private const int AiDraftLimit = 20;
    private const int AiDraftWindowMs = 60 * 60 * 1000;

    // A test send is a convenience, not a mailing list: more than this many
    // addresses in one request is a mistake or an abuse of the endpoint.
    private const int MaxTestRecipients = 10;

    // First of the two idempotency layers: an in-process, per-newsletter gate.
    // A double-clicked Send arrives twice within milliseconds — far too fast for
    // the second request to see the first one's persisted claim — so the cheap
    // door slams first, with no storage round-trip and no SendGrid call. The
    // persisted claim (layer two, below) is what covers a second instance, a
    // second admin, or a restart. Static because controllers are per-request;
    // bounded by the number of newsletters, which is small.
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> SendGates =
        new(StringComparer.OrdinalIgnoreCase);

    private readonly INewsletterStore _newsletters;
    private readonly IMemberStore _members;
    private readonly INewsletterSender _sender;
    private readonly INewsletterAiService _ai;
    private readonly KeyedRateLimiter _rateLimiter;
    private readonly NewsletterOptions _newsletterOpts;
    private readonly SendGridOptions _sendgrid;
    private readonly ILogger<AdminNewslettersController> _logger;

    public AdminNewslettersController(
        INewsletterStore newsletters,
        IMemberStore members,
        INewsletterSender sender,
        INewsletterAiService ai,
        KeyedRateLimiter rateLimiter,
        IOptions<NewsletterOptions> newsletterOpts,
        IOptions<SendGridOptions> sendgrid,
        ILogger<AdminNewslettersController> logger)
    {
        _newsletters = newsletters;
        _members = members;
        _sender = sender;
        _ai = ai;
        _rateLimiter = rateLimiter;
        _newsletterOpts = newsletterOpts.Value;
        _sendgrid = sendgrid.Value;
        _logger = logger;
    }

    private async Task<int> ComputeAudienceCountAsync(CancellationToken ct)
    {
        var members = await _members.ListAsync(ct);
        return members.Count(m =>
            string.Equals(m.Status, "active", StringComparison.OrdinalIgnoreCase)
            && !m.NewsletterOptOut
            && !string.IsNullOrWhiteSpace(m.Email)
            && m.Email.Contains('@'));
    }

    [HttpGet("")]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var newsletters = await _newsletters.ListAsync(ct);
        var audienceCount = await ComputeAudienceCountAsync(ct);
        var ordered = newsletters
            .OrderByDescending(n => n.CreatedAt, StringComparer.Ordinal)
            .Select(n => NewsletterDto.From(n, audienceCount))
            .ToList();

        return Ok(new
        {
            newsletters = ordered,
            total = ordered.Count,
            drafts = ordered.Count(n => n.Status == "draft"),
            published = ordered.Count(n => n.Status == "published"),
            sent = ordered.Count(n => n.Status == "sent"),
        });
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetOne(string id, CancellationToken ct)
    {
        var n = await _newsletters.GetByIdAsync(id, ct);
        if (n is null) return NotFound(new { message = "Newsletter not found." });
        // Send history only on the detail read — the list endpoint would carry it
        // for every row for no benefit.
        return Ok(NewsletterDto.From(
            n,
            await ComputeAudienceCountAsync(ct),
            includeHistory: true,
            senderAddress: _sendgrid.ResolvedFromEmail()));
    }

    [HttpPost("")]
    public async Task<IActionResult> Create([FromBody] CreateNewsletterRequest body, CancellationToken ct)
    {
        var validation = ValidateBody(
            body.TitleFr, body.TitleEn, body.BodyFr, body.BodyEn, body.Tag, body.CoverImageUrl, body.CoverImageKeyword);
        if (validation is not null) return BadRequest(new { message = validation });

        var admin = HttpContext.GetAdmin();
        var now = DateTime.UtcNow.ToString("o");
        var newsletter = new Newsletter
        {
            Id = Guid.NewGuid().ToString("N"),
            TitleFr = body.TitleFr!.Trim(),
            TitleEn = body.TitleEn!.Trim(),
            BodyFr = body.BodyFr!.Trim(),
            BodyEn = body.BodyEn!.Trim(),
            Tag = body.Tag!.Trim(),
            CoverImageUrl = (body.CoverImageUrl ?? "").Trim(),
            CoverImageKeyword = (body.CoverImageKeyword ?? "").Trim(),
            SourceBrief = (body.SourceBrief ?? "").Trim(),
            AiDrafted = body.AiDrafted,
            Status = "draft",
            CreatedByAdminId = admin?.MemberId ?? "",
            CreatedAt = now,
            UpdatedAt = now,
        };

        await _newsletters.UpsertAsync(newsletter, ct);
        var audienceCount = await ComputeAudienceCountAsync(ct);
        return Created(
            $"/api/admin/newsletters/{newsletter.Id}",
            NewsletterDto.From(newsletter, audienceCount));
    }

    // PUT, but the body is a PATCH-style merge: every field is nullable and only
    // the ones present are applied on top of the stored row (see the field-by-
    // field assignment below), then the MERGED result is validated. The verb
    // stays PUT for compatibility with the existing client; a null field means
    // "leave as is", never "clear it".
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] UpdateNewsletterRequest body, CancellationToken ct)
    {
        var newsletter = await _newsletters.GetByIdAsync(id, ct);
        if (newsletter is null) return NotFound(new { message = "Newsletter not found." });

        // A wrong-state request is 409 here exactly as it is on publish,
        // unpublish, send and delete — 400 is for a malformed body.
        if (string.Equals(newsletter.Status, "sent", StringComparison.OrdinalIgnoreCase))
            return Conflict(new
            {
                message = "A newsletter cannot be edited after it has been sent.",
                errorType = "cannot_edit_sent",
            });

        if (body.TitleFr is not null) newsletter.TitleFr = body.TitleFr.Trim();
        if (body.TitleEn is not null) newsletter.TitleEn = body.TitleEn.Trim();
        if (body.BodyFr is not null) newsletter.BodyFr = body.BodyFr.Trim();
        if (body.BodyEn is not null) newsletter.BodyEn = body.BodyEn.Trim();
        if (body.Tag is not null) newsletter.Tag = body.Tag.Trim();
        if (body.CoverImageUrl is not null) newsletter.CoverImageUrl = body.CoverImageUrl.Trim();
        if (body.CoverImageKeyword is not null) newsletter.CoverImageKeyword = body.CoverImageKeyword.Trim();
        if (body.SourceBrief is not null) newsletter.SourceBrief = body.SourceBrief.Trim();

        // Validate the merged state — a partial update that leaves a required
        // field empty is still a bad request.
        var validation = ValidateBody(
            newsletter.TitleFr, newsletter.TitleEn, newsletter.BodyFr, newsletter.BodyEn, newsletter.Tag,
            newsletter.CoverImageUrl, newsletter.CoverImageKeyword);
        if (validation is not null) return BadRequest(new { message = validation });

        newsletter.UpdatedAt = DateTime.UtcNow.ToString("o");
        await _newsletters.UpsertAsync(newsletter, ct);
        return Ok(NewsletterDto.From(newsletter, await ComputeAudienceCountAsync(ct)));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
    {
        var newsletter = await _newsletters.GetByIdAsync(id, ct);
        if (newsletter is null) return NotFound(new { message = "Newsletter not found." });

        // A delivered issue is a record, not a draft: deleting it would destroy
        // the send audit (who received it, who failed), retroactively remove it
        // from the member feed, and — since delete was the only way past the
        // "already sent" 409 — it was the workaround admins reached for when a
        // send partially failed. /resend-failed replaces that need.
        if (string.Equals(newsletter.Status, "sent", StringComparison.OrdinalIgnoreCase))
            return Conflict(new
            {
                message = "A newsletter that has been sent cannot be deleted. Unsent drafts and published issues can.",
                errorType = "cannot_delete_sent",
            });

        await _newsletters.DeleteAsync(newsletter.Id, ct);
        _logger.LogInformation("Admin deleted newsletter {Id}", newsletter.Id);
        return NoContent();
    }

    [HttpPost("{id}/publish")]
    public async Task<IActionResult> Publish(string id, CancellationToken ct)
    {
        var newsletter = await _newsletters.GetByIdAsync(id, ct);
        if (newsletter is null) return NotFound(new { message = "Newsletter not found." });
        if (!string.Equals(newsletter.Status, "draft", StringComparison.OrdinalIgnoreCase))
            return Conflict(new { message = "Only draft newsletters can be published.", errorType = "not_draft" });

        newsletter.Status = "published";
        newsletter.PublishedAt = DateTime.UtcNow.ToString("o");
        newsletter.UpdatedAt = newsletter.PublishedAt;
        await _newsletters.UpsertAsync(newsletter, ct);

        return Ok(NewsletterDto.From(newsletter, await ComputeAudienceCountAsync(ct)));
    }

    [HttpPost("{id}/unpublish")]
    public async Task<IActionResult> Unpublish(string id, CancellationToken ct)
    {
        var newsletter = await _newsletters.GetByIdAsync(id, ct);
        if (newsletter is null) return NotFound(new { message = "Newsletter not found." });
        if (!string.Equals(newsletter.Status, "published", StringComparison.OrdinalIgnoreCase))
            return Conflict(new { message = "Only published newsletters can be unpublished.", errorType = "not_published" });

        newsletter.Status = "draft";
        newsletter.PublishedAt = null;
        newsletter.UpdatedAt = DateTime.UtcNow.ToString("o");
        await _newsletters.UpsertAsync(newsletter, ct);

        return Ok(NewsletterDto.From(newsletter, await ComputeAudienceCountAsync(ct)));
    }

    /// <summary>
    /// Sends a newsletter — to the full member audience, or to explicit test
    /// addresses when the body carries <c>testEmails</c>.
    /// <para>
    /// Test intent is decided by "did the caller send the field at all", not by
    /// whether anything usable is in it. <c>{"testEmails":[""]}</c> used to
    /// evaluate to "not a test send" and quietly mail the entire membership;
    /// today it is a 400 (<c>no_valid_test_recipients</c>). Addresses are
    /// trimmed, validated and deduped here, once, and the cleaned list is what
    /// travels downstream.
    /// </para>
    /// <para>
    /// A dispatch that ran answers 200 with the audit and an ok/outcome
    /// discriminator even when every message failed — see
    /// <see cref="SendAuditDto"/>. Non-2xx means the request itself was
    /// refused.
    /// </para>
    /// </summary>
    [HttpPost("{id}/send")]
    public async Task<IActionResult> Send(string id, [FromBody] SendNewsletterRequest? body, CancellationToken ct)
    {
        var supplied = body?.TestEmails;
        var testEmails = CleanTestEmails(supplied);

        if (supplied is not null)
        {
            // The field was present: this is a test send, and it must resolve to
            // at least one usable address. Falling through to the real audience
            // because nothing survived validation is exactly the accident this
            // guard exists to prevent.
            if (testEmails.Count == 0)
                return BadRequest(new
                {
                    message = "No valid test address was provided. Give at least one address, or omit testEmails entirely to send to every member.",
                    errorType = "no_valid_test_recipients",
                });

            if (testEmails.Count > MaxTestRecipients)
                return BadRequest(new
                {
                    message = $"A test send accepts at most {MaxTestRecipients} addresses.",
                    errorType = "too_many_test_recipients",
                });
        }

        var testMode = testEmails.Count > 0;

        // Idempotency layer 1, before any I/O: a same-instance double-click is
        // refused here without touching storage or SendGrid.
        var gate = TryEnterSendGate(id);
        if (gate is null) return SendAlreadyInProgress(null);
        try
        {
            var (newsletter, etag) = await _newsletters.GetWithEtagAsync(id, ct);
            if (newsletter is null) return NotFound(new { message = "Newsletter not found." });

            if (!testMode && !string.Equals(newsletter.Status, "published", StringComparison.OrdinalIgnoreCase))
                return Conflict(new
                {
                    message = "Only published newsletters can be sent.",
                    errorType = "newsletter_not_published",
                });

            var adminId = HttpContext.GetAdmin()?.MemberId ?? "";
            return await DispatchWithClaimAsync(
                newsletter,
                etag,
                adminId,
                token => _sender.SendAsync(newsletter.Id, adminId, testMode ? testEmails : null, token),
                ct);
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>
    /// Re-sends a newsletter to the recipients its most recent real send
    /// recorded as failed — and only to them. Members who already received the
    /// issue are never in that list, so nobody gets a second copy. Appends a new
    /// <c>SendHistory</c> entry and returns the same audit DTO shape as /send.
    /// <para>
    /// This is the missing path that made deleting a sent newsletter — audit and
    /// all — the only way to reach a failed recipient.
    /// </para>
    /// </summary>
    [HttpPost("{id}/resend-failed")]
    public async Task<IActionResult> ResendFailed(string id, CancellationToken ct)
    {
        var gate = TryEnterSendGate(id);
        if (gate is null) return SendAlreadyInProgress(null);
        try
        {
            var (newsletter, etag) = await _newsletters.GetWithEtagAsync(id, ct);
            if (newsletter is null) return NotFound(new { message = "Newsletter not found." });

            var lastRealSend = MostRecentRealSend(newsletter);
            if (lastRealSend is null)
                return Conflict(new
                {
                    message = "This newsletter has not been sent yet, so there is nothing to retry.",
                    errorType = "no_prior_send",
                });

            var targets = lastRealSend.FailedRecipients
                .Where(t => !string.IsNullOrWhiteSpace(t))
                .Select(t => t.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (targets.Count == 0)
                return Conflict(new
                {
                    message = "The last send recorded no failed recipients.",
                    errorType = "nothing_to_resend",
                });

            var adminId = HttpContext.GetAdmin()?.MemberId ?? "";
            _logger.LogInformation(
                "Admin {AdminId} retrying {Count} failed recipients of newsletter {Id}",
                adminId, targets.Count, newsletter.Id);

            return await DispatchWithClaimAsync(
                newsletter,
                etag,
                adminId,
                token => _sender.ResendAsync(newsletter.Id, adminId, targets, token),
                ct);
        }
        finally
        {
            gate.Release();
        }
    }

    [HttpPost("draft-ai")]
    public async Task<IActionResult> DraftAi([FromBody] AiDraftRequest body, CancellationToken ct)
    {
        var admin = HttpContext.GetAdmin();
        var key = admin?.MemberId ?? "anon";
        if (_rateLimiter.IsRateLimited(AiDraftBucket, key, AiDraftLimit, AiDraftWindowMs))
        {
            return StatusCode(429, new
            {
                message = "Too many AI drafts recently. Please wait a few minutes before trying again.",
            });
        }

        var brief = (body.Brief ?? "").Trim();
        if (string.IsNullOrEmpty(brief))
            return BadRequest(new { message = "A brief is required." });
        if (brief.Length > 500)
            return BadRequest(new { message = "The brief must be 500 characters or fewer." });

        var result = await _ai.DraftAsync(brief, body.Tone?.Trim(), ct);
        if (!result.Success || result.Draft is null)
        {
            return StatusCode(502, new
            {
                message = "The AI drafter could not produce a valid newsletter. Try rephrasing your brief.",
                errorCode = result.ErrorCode ?? "ai_upstream",
                httpStatus = result.HttpStatus,
                raw = result.Raw,
            });
        }

        return Ok(result.Draft);
    }

    // ---------------------------------------------------------------------
    // Send guards
    // ---------------------------------------------------------------------

    /// <summary>
    /// Idempotency layer 1: takes this instance's per-newsletter send gate, or
    /// returns null when a send for the same id is already running here. Wait(0)
    /// never blocks, so a double-click costs nothing. The caller MUST release the
    /// returned semaphore in a finally.
    /// </summary>
    private static SemaphoreSlim? TryEnterSendGate(string? newsletterId)
    {
        var gate = SendGates.GetOrAdd(newsletterId ?? "", _ => new SemaphoreSlim(1, 1));
        return gate.Wait(0) ? gate : null;
    }

    /// <summary>
    /// Idempotency layer 2, then the dispatch. The persisted claim is written
    /// with a conditional (ETag / RowVersion) update, so exactly one caller —
    /// across instances and restarts, where the in-process gate cannot help —
    /// owns the send; it is released when the dispatch finishes, success or
    /// failure.
    /// </summary>
    private async Task<IActionResult> DispatchWithClaimAsync(
        Newsletter newsletter,
        string? etag,
        string adminId,
        Func<CancellationToken, Task<NewsletterSendAudit>> dispatch,
        CancellationToken ct)
    {
        var claimConflict = await TryClaimSendAsync(newsletter, etag, adminId, ct);
        if (claimConflict is not null) return claimConflict;

        NewsletterSendAudit audit;
        try
        {
            audit = await dispatch(ct);
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogError(ex, "Newsletter {Id} send failed to initialize", newsletter.Id);
            return StatusCode(500, new { message = ex.Message, errorType = "sender_not_configured" });
        }
        finally
        {
            // The sender clears the claim as part of its audit write; this covers
            // the paths where it never got that far (a missing API key, a
            // newsletter that vanished between the read and the dispatch).
            await ReleaseSendClaimAsync(newsletter.Id);
        }

        // 200 even when every recipient failed — the body's ok/outcome pair
        // carries that, and the audit is the whole point of the response.
        return Ok(SendAuditDto.From(newsletter.Id, audit));
    }

    /// <summary>
    /// Takes the persisted send claim, or returns the 409 to answer with.
    /// Fail-closed: if the conditional update does not land — someone else
    /// claimed the row, or changed it at all — this refuses rather than sending.
    /// </summary>
    private async Task<IActionResult?> TryClaimSendAsync(
        Newsletter newsletter,
        string? etag,
        string adminId,
        CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var staleAfter = TimeSpan.FromMinutes(Math.Clamp(_newsletterOpts.SendClaimStaleMinutes, 1, 24 * 60));

        // A live claim means a send is running (or died less than the staleness
        // window ago). An older one is assumed dead and taken over.
        if (!string.IsNullOrWhiteSpace(newsletter.SendClaimedAtUtc)
            && DateTime.TryParse(
                newsletter.SendClaimedAtUtc,
                CultureInfo.InvariantCulture,
                DateTimeStyles.RoundtripKind | DateTimeStyles.AdjustToUniversal,
                out var claimedAt)
            && now - claimedAt < staleAfter)
        {
            return SendAlreadyInProgress(newsletter.SendClaimedAtUtc);
        }

        newsletter.SendClaimedAtUtc = now.ToString("o");
        newsletter.SendClaimedByAdminId = adminId;
        newsletter.UpdatedAt = newsletter.SendClaimedAtUtc;

        if (!await _newsletters.TryUpdateIfUnchangedAsync(newsletter, etag, ct))
        {
            _logger.LogWarning(
                "Newsletter {Id} send claim lost a race (admin {AdminId}) — refusing to dispatch",
                newsletter.Id, adminId);
            return SendAlreadyInProgress(null);
        }

        return null;
    }

    /// <summary>
    /// Clears the send claim, best effort. Never uses the request's token: the
    /// claim has to be dropped even when the admin closed the tab mid-send,
    /// otherwise the newsletter stays locked until the staleness window expires.
    /// Re-reads first, so it never overwrites the audit the sender just wrote.
    /// </summary>
    private async Task ReleaseSendClaimAsync(string newsletterId)
    {
        for (var attempt = 1; attempt <= 3; attempt++)
        {
            try
            {
                var (fresh, etag) = await _newsletters.GetWithEtagAsync(newsletterId, CancellationToken.None);
                if (fresh is null) return;
                if (string.IsNullOrEmpty(fresh.SendClaimedAtUtc)
                    && string.IsNullOrEmpty(fresh.SendClaimedByAdminId))
                {
                    return; // the sender's audit write already released it
                }

                fresh.SendClaimedAtUtc = null;
                fresh.SendClaimedByAdminId = null;
                fresh.UpdatedAt = DateTime.UtcNow.ToString("o");
                if (await _newsletters.TryUpdateIfUnchangedAsync(fresh, etag, CancellationToken.None)) return;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Newsletter {Id} send claim release attempt {Attempt} failed", newsletterId, attempt);
            }
        }

        _logger.LogError(
            "Newsletter {Id} send claim could not be released; it expires after {Minutes} minutes",
            newsletterId, _newsletterOpts.SendClaimStaleMinutes);
    }

    private ObjectResult SendAlreadyInProgress(string? claimedAtUtc) =>
        Conflict(new
        {
            message = "A send for this newsletter is already in progress. Wait for it to finish before sending again.",
            errorType = "send_already_in_progress",
            claimedAtUtc,
        });

    /// <summary>Most recent REAL (non-test) send: LastSend normally, falling back
    /// to the history for rows written before test audits were split out.</summary>
    private static NewsletterSendAudit? MostRecentRealSend(Newsletter n)
    {
        if (n.LastSend is { TestMode: false }) return n.LastSend;
        return n.SendHistory?.FirstOrDefault(a => !a.TestMode);
    }

    /// <summary>
    /// Trims, validates and dedupes the caller's test addresses — once, here, so
    /// no downstream layer has to guess what "test mode" means. Returns the
    /// addresses that survive; the caller decides what an empty result means
    /// (400 when the field was supplied, real send when it was absent).
    /// </summary>
    private static List<string> CleanTestEmails(IEnumerable<string>? raw)
    {
        var cleaned = new List<string>();
        if (raw is null) return cleaned;

        foreach (var candidate in raw)
        {
            var email = (candidate ?? "").Trim();
            if (!IsPlausibleEmail(email)) continue;
            if (cleaned.Any(e => string.Equals(e, email, StringComparison.OrdinalIgnoreCase))) continue;
            cleaned.Add(email);
        }

        return cleaned;
    }

    // Deliberately loose — SendGrid is the real arbiter of deliverability. This
    // only rejects what cannot possibly be an address, including anything with
    // whitespace or control characters (which would also be a header-injection
    // vector further down).
    private static bool IsPlausibleEmail(string email)
    {
        if (string.IsNullOrWhiteSpace(email) || email.Length > 254) return false;
        if (email.Any(ch => char.IsWhiteSpace(ch) || char.IsControl(ch))) return false;

        var at = email.IndexOf('@');
        if (at <= 0 || at != email.LastIndexOf('@') || at == email.Length - 1) return false;

        var domain = email[(at + 1)..];
        return domain.Contains('.') && !domain.StartsWith('.') && !domain.EndsWith('.');
    }

    // Shared validation for create and post-merge update — every required
    // field must be non-empty and within reasonable bounds. Newsletter cover
    // fields are optional (the AI drafter or a manual paste resolves them
    // later).
    private static string? ValidateBody(
        string? titleFr,
        string? titleEn,
        string? bodyFr,
        string? bodyEn,
        string? tag,
        string? coverImageUrl,
        string? coverImageKeyword)
    {
        if (string.IsNullOrWhiteSpace(titleFr) || string.IsNullOrWhiteSpace(titleEn))
            return "Both French and English titles are required.";
        if (string.IsNullOrWhiteSpace(bodyFr) || string.IsNullOrWhiteSpace(bodyEn))
            return "Both French and English bodies are required.";
        if (string.IsNullOrWhiteSpace(tag))
            return "A tag is required.";
        if (titleFr.Trim().Length > 200 || titleEn.Trim().Length > 200)
            return "Titles must be 200 characters or fewer.";
        if (bodyFr.Length > 10_000 || bodyEn.Length > 10_000)
            return "Bodies must be 10,000 characters or fewer.";
        // Absolute AND http(s) only. Uri.TryCreate happily accepts "javascript:"
        // and "data:" URIs, which would then be emitted into the <img src> of
        // every newsletter email and rendered on the member portal.
        if (!string.IsNullOrWhiteSpace(coverImageUrl))
        {
            if (!Uri.TryCreate(coverImageUrl.Trim(), UriKind.Absolute, out var coverUri))
                return "coverImageUrl must be an absolute URL when provided.";
            if (coverUri.Scheme != Uri.UriSchemeHttp && coverUri.Scheme != Uri.UriSchemeHttps)
                return "coverImageUrl must use http or https.";
        }
        _ = coverImageKeyword; // reserved for future validation
        return null;
    }
}
