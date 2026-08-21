namespace Pavillon46.Api.Models;

// ---------------------------------------------------------------------------
// Newsletter domain — persisted through NewsletterStore (Azure Table Storage
// with the same JSONL/in-memory fallback ladder as MemberStore).
// Every newsletter carries bilingual FR/EN copy, a cover image, an audit trail
// of its last send (see NewsletterSendAudit), and a status lifecycle
// draft → published → sent. Once "sent" the row becomes read-only (updates
// blocked in the controller).
// ---------------------------------------------------------------------------

public class Newsletter
{
    public string Id { get; set; } = "";
    public string TitleFr { get; set; } = "";
    public string TitleEn { get; set; } = "";
    // Paragraphs are separated by "\n\n" — the sender splits on that when
    // building HTML and the dashboard renderer does the same.
    public string BodyFr { get; set; } = "";
    public string BodyEn { get; set; } = "";
    // Short lowercase English phrase (e.g. "winter", "harvest supper").
    public string Tag { get; set; } = "";
    // Final cover image URL used in the email and dashboard. Either an Unsplash
    // Source URL derived from CoverImageKeyword (HEAD-verified server-side) or
    // the bundled site fallback when Unsplash does not resolve.
    public string CoverImageUrl { get; set; } = "";
    public string CoverImageKeyword { get; set; } = "";
    // "draft" | "published" | "sent"
    public string Status { get; set; } = "draft";
    public string CreatedByAdminId { get; set; } = "";
    public string CreatedAt { get; set; } = "";
    public string UpdatedAt { get; set; } = "";
    public string? PublishedAt { get; set; }
    public string? LastSentAt { get; set; }
    public bool AiDrafted { get; set; }
    // The one-line brief the admin passed to the AI drafter, kept for
    // provenance. Empty for hand-authored newsletters.
    public string SourceBrief { get; set; } = "";
    // Latest send audit — overwritten on each successful send. History is not
    // retained by design (see docs); the dashboard only surfaces the most
    // recent attempt.
    public NewsletterSendAudit? LastSend { get; set; }
}

public class NewsletterSendAudit
{
    public string SentAt { get; set; } = "";
    public string AdminId { get; set; } = "";
    public int TotalRecipients { get; set; }
    public int Sent { get; set; }
    public int Failed { get; set; }
    public int Batches { get; set; }
    public bool TestMode { get; set; }
    public List<string> FailedRecipients { get; set; } = new();
    // Human-readable error lines, capped at 20 by NewsletterSender so an
    // outage can't blow up storage or the response payload.
    public List<string> Errors { get; set; } = new();
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

public record CreateNewsletterRequest(
    string? TitleFr,
    string? TitleEn,
    string? BodyFr,
    string? BodyEn,
    string? Tag,
    string? CoverImageUrl,
    string? CoverImageKeyword,
    string? SourceBrief,
    bool AiDrafted = false
);

public record UpdateNewsletterRequest(
    string? TitleFr,
    string? TitleEn,
    string? BodyFr,
    string? BodyEn,
    string? Tag,
    string? CoverImageUrl,
    string? CoverImageKeyword,
    string? SourceBrief
);

public record AiDraftRequest(string? Brief, string? Tone);

public record SendNewsletterRequest(List<string>? TestEmails);

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

public class NewsletterDto
{
    public string Id { get; set; } = "";
    public string TitleFr { get; set; } = "";
    public string TitleEn { get; set; } = "";
    public string BodyFr { get; set; } = "";
    public string BodyEn { get; set; } = "";
    public string Tag { get; set; } = "";
    public string CoverImageUrl { get; set; } = "";
    public string CoverImageKeyword { get; set; } = "";
    public string Status { get; set; } = "draft";
    public string CreatedByAdminId { get; set; } = "";
    public string CreatedAt { get; set; } = "";
    public string UpdatedAt { get; set; } = "";
    public string? PublishedAt { get; set; }
    public string? LastSentAt { get; set; }
    public bool AiDrafted { get; set; }
    public string SourceBrief { get; set; } = "";
    public NewsletterSendAudit? LastSend { get; set; }
    // Number of active, non-opt-out members with an email — the "N members"
    // the admin will hit if they trigger a send right now. Computed at read
    // time in AdminNewslettersController against the current member store.
    public int AudienceCount { get; set; }

    public static NewsletterDto From(Newsletter n, int audienceCount) => new()
    {
        Id = n.Id,
        TitleFr = n.TitleFr,
        TitleEn = n.TitleEn,
        BodyFr = n.BodyFr,
        BodyEn = n.BodyEn,
        Tag = n.Tag,
        CoverImageUrl = n.CoverImageUrl,
        CoverImageKeyword = n.CoverImageKeyword,
        Status = n.Status,
        CreatedByAdminId = n.CreatedByAdminId,
        CreatedAt = n.CreatedAt,
        UpdatedAt = n.UpdatedAt,
        PublishedAt = n.PublishedAt,
        LastSentAt = n.LastSentAt,
        AiDrafted = n.AiDrafted,
        SourceBrief = n.SourceBrief,
        LastSend = n.LastSend,
        AudienceCount = audienceCount,
    };
}

public class MemberNewsletterDto
{
    public string Id { get; set; } = "";
    // ISO date (YYYY-MM-DD) taken from PublishedAt.
    public string Date { get; set; } = "";
    public string Tag { get; set; } = "";
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public string CoverImageUrl { get; set; } = "";
}

public class AiDraftResponse
{
    public string TitleFr { get; set; } = "";
    public string TitleEn { get; set; } = "";
    public string BodyFr { get; set; } = "";
    public string BodyEn { get; set; } = "";
    public string Tag { get; set; } = "";
    public string CoverImageKeyword { get; set; } = "";
    public string CoverImageUrl { get; set; } = "";
}

// Wrapper the AI service returns to the controller so failures carry an error
// code that maps 1:1 to the design's 502 response shape (ai_upstream,
// ai_parse_failed, ai_incomplete, ai_timeout).
public class AiDraftResult
{
    public bool Success { get; set; }
    public AiDraftResponse? Draft { get; set; }
    public string? ErrorCode { get; set; }
    public string? Raw { get; set; }
    public int? HttpStatus { get; set; }
}

public class SendAuditDto
{
    public string NewsletterId { get; set; } = "";
    public string SentAt { get; set; } = "";
    public string AdminId { get; set; } = "";
    public int TotalRecipients { get; set; }
    public int Sent { get; set; }
    public int Failed { get; set; }
    public int Batches { get; set; }
    public bool TestMode { get; set; }
    public List<string> FailedRecipients { get; set; } = new();
    public List<string> Errors { get; set; } = new();

    public static SendAuditDto From(string newsletterId, NewsletterSendAudit a) => new()
    {
        NewsletterId = newsletterId,
        SentAt = a.SentAt,
        AdminId = a.AdminId,
        TotalRecipients = a.TotalRecipients,
        Sent = a.Sent,
        Failed = a.Failed,
        Batches = a.Batches,
        TestMode = a.TestMode,
        FailedRecipients = a.FailedRecipients,
        Errors = a.Errors,
    };
}
