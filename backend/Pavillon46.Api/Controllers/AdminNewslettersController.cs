using Microsoft.AspNetCore.Mvc;
using Pavillon46.Api.Models;
using Pavillon46.Api.Security;
using Pavillon46.Api.Services;

namespace Pavillon46.Api.Controllers;

/// <summary>
/// Admin-only surface for the newsletter module. Class-level
/// <see cref="AdminAuthorizeAttribute"/> gates every endpoint except the
/// listing/detail/publish/send flow — nothing on this controller is reachable
/// without a valid admin bearer. Public-facing routes (member listing,
/// unsubscribe) live in <c>MembersController</c> and <c>NewslettersController</c>.
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

    private readonly INewsletterStore _newsletters;
    private readonly IMemberStore _members;
    private readonly INewsletterSender _sender;
    private readonly INewsletterAiService _ai;
    private readonly KeyedRateLimiter _rateLimiter;
    private readonly ILogger<AdminNewslettersController> _logger;

    public AdminNewslettersController(
        INewsletterStore newsletters,
        IMemberStore members,
        INewsletterSender sender,
        INewsletterAiService ai,
        KeyedRateLimiter rateLimiter,
        ILogger<AdminNewslettersController> logger)
    {
        _newsletters = newsletters;
        _members = members;
        _sender = sender;
        _ai = ai;
        _rateLimiter = rateLimiter;
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
        return Ok(NewsletterDto.From(n, await ComputeAudienceCountAsync(ct)));
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

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] UpdateNewsletterRequest body, CancellationToken ct)
    {
        var newsletter = await _newsletters.GetByIdAsync(id, ct);
        if (newsletter is null) return NotFound(new { message = "Newsletter not found." });

        if (string.Equals(newsletter.Status, "sent", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "A newsletter cannot be edited after it has been sent." });

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
            return Conflict(new { message = "Only draft newsletters can be published." });

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
            return Conflict(new { message = "Only published newsletters can be unpublished." });

        newsletter.Status = "draft";
        newsletter.PublishedAt = null;
        newsletter.UpdatedAt = DateTime.UtcNow.ToString("o");
        await _newsletters.UpsertAsync(newsletter, ct);

        return Ok(NewsletterDto.From(newsletter, await ComputeAudienceCountAsync(ct)));
    }

    [HttpPost("{id}/send")]
    public async Task<IActionResult> Send(string id, [FromBody] SendNewsletterRequest? body, CancellationToken ct)
    {
        var newsletter = await _newsletters.GetByIdAsync(id, ct);
        if (newsletter is null) return NotFound(new { message = "Newsletter not found." });

        var testEmails = body?.TestEmails ?? new List<string>();
        var testMode = testEmails.Any(e => !string.IsNullOrWhiteSpace(e));

        if (!testMode && !string.Equals(newsletter.Status, "published", StringComparison.OrdinalIgnoreCase))
            return Conflict(new { message = "Only published newsletters can be sent." });

        var admin = HttpContext.GetAdmin();
        NewsletterSendAudit audit;
        try
        {
            audit = await _sender.SendAsync(
                newsletter.Id,
                admin?.MemberId ?? "",
                testMode ? testEmails : null,
                ct);
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogError(ex, "Newsletter {Id} send failed to initialize", newsletter.Id);
            return StatusCode(500, new { message = ex.Message });
        }

        var dto = SendAuditDto.From(newsletter.Id, audit);
        // Every batch failing while at least one message was accepted is a
        // partial success — 502 with the audit so the UI can render it either
        // way. Zero success and any failure counts as full upstream failure.
        if (audit.Sent == 0 && audit.Failed > 0)
            return StatusCode(502, dto);

        return Ok(dto);
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
