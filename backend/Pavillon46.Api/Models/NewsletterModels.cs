using System.Text.Json.Serialization;

namespace Pavillon46.Api.Models;

// ---------------------------------------------------------------------------
// Newsletter domain — persisted through NewsletterStore (Azure Table Storage
// with the same JSONL/in-memory fallback ladder as MemberStore).
// Every newsletter carries bilingual FR/EN copy, a cover image, an audit trail
// of its sends (see NewsletterSendAudit: LastSend, LastTestSend, SendHistory),
// and a status lifecycle draft → published → sent. Once "sent" the row becomes
// read-only AND undeletable (both 409 in the controller) — it is the delivery
// record for an issue that is already in members' inboxes.
// ---------------------------------------------------------------------------

public class Newsletter
{
    public string Id { get; set; } = "";
    public string TitleFr { get; set; } = "";
    public string TitleEn { get; set; } = "";
    // CommonMark. NewsletterEmailRenderer turns it into inline-styled email HTML
    // and into plain text for the text/plain part; the dashboard and the admin
    // preview render the same source through react-markdown. Raw HTML is never
    // markup on any of the three surfaces.
    public string BodyFr { get; set; } = "";
    public string BodyEn { get; set; } = "";
    // Short lowercase English phrase (e.g. "winter", "harvest supper").
    public string Tag { get; set; } = "";
    // Final cover image URL used in the email and dashboard. Either a photo
    // NewsletterAiService resolved through the Unsplash Search API (pinned to a
    // fixed rendition on images.unsplash.com, so every recipient sees the same
    // frame) or one an admin pasted; validated as absolute http(s) on write.
    // EMPTY IS A VALID STATE and means "no cover was chosen": nothing here is
    // ever fabricated, and the email omits the cover row entirely rather than
    // falling back to a placeholder file.
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

    // Audit of the most recent REAL send (a full-audience send or a
    // resend-failed). Test sends never touch this — they land in LastTestSend —
    // so a post-send test mail can no longer erase the record of who actually
    // received the issue, and resend-failed always has a truthful list of
    // member ids to retry.
    public NewsletterSendAudit? LastSend { get; set; }

    // Audit of the most recent TEST send. Overwritten freely; carries no
    // delivery record worth preserving.
    public NewsletterSendAudit? LastTestSend { get; set; }

    // Real sends only, most recent first, capped by NewsletterSender so a
    // re-send does not erase the previous send's record. Entries are compact
    // (counters plus a couple of error lines, no recipient lists) — the whole
    // row is serialized into a single Azure Table "data" property with a 64KB
    // ceiling, so only LastSend carries the capped failed-recipient list.
    public List<NewsletterSendAudit> SendHistory { get; set; } = new();

    // --- send claim: the persisted half of the idempotency guard ------------
    // Written through a conditional (ETag / RowVersion) update immediately
    // before dispatch and cleared when the send finishes, success or failure. A
    // claim younger than NewsletterOptions.SendClaimStaleMinutes makes /send and
    // /resend-failed answer 409 send_already_in_progress, so a double-click — or
    // a second admin, or a second instance — cannot mail the membership twice.
    // A crashed send leaves a claim behind; the staleness window is what frees
    // the newsletter again without manual intervention.
    public string? SendClaimedAtUtc { get; set; }
    public string? SendClaimedByAdminId { get; set; }

    // Optimistic-concurrency stamp used by the JsonTableStore FILE and MEMORY
    // fallbacks (the Azure path compares the row's real ETag instead and leaves
    // this empty). Bumped by the store on every successful conditional write —
    // never assign it by hand.
    public string? RowVersion { get; set; }
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
    // "send" (full audience) | "test" | "resend" (retry of a previous send's
    // failures). TestMode is kept alongside it for existing clients.
    public string Kind { get; set; } = "send";

    // Member ids of the recipients whose delivery failed, capped by
    // NewsletterSender (see MaxFailedRecipientsRecorded). Ids rather than email
    // addresses: less PII sitting in an audit row, and it is exactly what
    // /resend-failed needs. Truncation is visible through FailedTotal.
    public List<string> FailedRecipients { get; set; } = new();

    // True number of failures, which FailedRecipients may under-report once the
    // cap is hit. Equal to Failed; kept explicit so a reader of a truncated
    // list can tell how much is missing. A broad upstream outage used to
    // serialize every failed address into the row's single "data" property and
    // blow Table Storage's 64KB property limit — which threw, lost the audit
    // AND left the status un-flipped, inviting a duplicate send.
    public int FailedTotal { get; set; }

    // Email addresses of every failure, uncapped — request-scoped only. Never
    // persisted (JsonIgnore) and never serialized into a newsletter response;
    // SendAuditDto lifts it so the admin who triggered THIS send sees real
    // addresses instead of opaque ids.
    [JsonIgnore]
    public List<string> FailedRecipientEmails { get; set; } = new();

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
    public NewsletterSendAudit? LastTestSend { get; set; }
    // Compact history of real sends, most recent first. Only populated on the
    // single-newsletter read (includeHistory) — the list endpoint would carry
    // it for every row for no benefit.
    public List<NewsletterSendAudit>? SendHistory { get; set; }
    // Non-null while a send holds the claim on this newsletter: the UI can grey
    // out its Send button instead of discovering the 409 the hard way.
    public string? SendClaimedAtUtc { get; set; }
    // Number of active, non-opt-out members with an email — the "N members"
    // the admin will hit if they trigger a send right now. Computed at read
    // time in AdminNewslettersController against the current member store.
    public int AudienceCount { get; set; }

    /// <summary>The <c>From:</c> address members will actually see, resolved
    /// server-side from <c>SendGridOptions</c> (env-only, so the browser has no
    /// other way to learn it). Populated on the detail read; empty elsewhere —
    /// the send-confirmation dialog needs it, a list row does not. Without it
    /// the dialog had to hard-code a guess, and told the admin the wrong sender
    /// in the one dialog whose action cannot be undone.</summary>
    public string SenderAddress { get; set; } = "";

    public static NewsletterDto From(
        Newsletter n,
        int audienceCount,
        bool includeHistory = false,
        string senderAddress = "") => new()
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
        LastTestSend = n.LastTestSend,
        SendHistory = includeHistory ? (n.SendHistory ?? new List<NewsletterSendAudit>()) : null,
        SendClaimedAtUtc = n.SendClaimedAtUtc,
        AudienceCount = audienceCount,
        SenderAddress = senderAddress,
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

/// <summary>
/// What the model wrote, plus what the server could (or could not) work out
/// about the cover photograph. The editor needs the difference: an empty
/// <see cref="CoverImageUrl"/> with <c>CoverImageStatus = "no_api_key"</c> means
/// "nobody picked a photo yet, here is the keyword to search with" — not "here
/// is your cover", and must not render as a broken image.
/// <para>
/// The first seven properties are the model's six JSON keys plus the resolved
/// URL. The Cover* properties below are set by <c>NewsletterAiService</c> AFTER
/// the model's JSON is deserialized and are overwritten unconditionally, so a
/// model that tries to emit them cannot forge an attribution or claim a cover
/// resolved. They live here, on the DTO, rather than on a service-local subclass:
/// <c>AiDraftResult.Draft</c> is typed as this class, so anything that casts to
/// the declared type or declares a ProducesResponseType would otherwise silently
/// drop five fields off the wire.
/// </para>
/// </summary>
public class AiDraftResponse
{
    public string TitleFr { get; set; } = "";
    public string TitleEn { get; set; } = "";
    public string BodyFr { get; set; } = "";
    public string BodyEn { get; set; } = "";
    public string Tag { get; set; } = "";
    public string CoverImageKeyword { get; set; } = "";
    public string CoverImageUrl { get; set; } = "";

    /// <summary>True only when <see cref="CoverImageUrl"/> is a real Unsplash
    /// photo the server resolved. False means the URL is empty by design.</summary>
    public bool CoverImageAutoResolved { get; set; }

    /// <summary>Machine-readable reason, for the UI to phrase in FR/EN:
    /// <c>resolved</c> | <c>no_api_key</c> | <c>no_match</c> |
    /// <c>lookup_failed</c> | <c>no_keyword</c>.</summary>
    public string CoverImageStatus { get; set; } = "no_keyword";

    /// <summary>Fallback English sentence for the same thing, safe to show as-is
    /// and useful in logs. Empty when the cover resolved.</summary>
    public string CoverImageNote { get; set; } = "";

    /// <summary>Photographer's name — Unsplash's API terms require crediting
    /// them wherever the photo is shown. Empty unless the cover resolved.</summary>
    public string CoverImagePhotographer { get; set; } = "";

    /// <summary>Photographer's Unsplash profile, with the referral parameters
    /// the terms ask for. Empty unless the cover resolved.</summary>
    public string CoverImagePhotographerUrl { get; set; } = "";
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

/// <summary>
/// Response body of POST /send and POST /resend-failed.
/// <para>
/// Shape contract: a dispatch that ran is always HTTP <b>200</b>, even when
/// every single message failed, and the caller reads the outcome off the body:
/// </para>
/// <code>
/// {
///   "newsletterId": "…", "sentAt": "…", "adminId": "…", "kind": "send",
///   "ok": false,                 // false as soon as one recipient failed
///   "outcome": "all_failed",     // "sent" | "partial" | "all_failed"
///   "totalRecipients": 412, "sent": 0, "failed": 412, "failedTotal": 412,
///   "batches": 1, "testMode": false,
///   "failedRecipients": ["a@b.ch", …],   // addresses for this request
///   "failedRecipientIds": ["7f3c…", …],  // capped, as persisted
///   "errors": ["batch 1 — 412 recipients failed: SendGrid 401 - …"]
/// }
/// </code>
/// <para>
/// Non-2xx is reserved for request-level errors (unknown id, wrong state, bad
/// input, sender misconfigured), whose body is the usual
/// <c>{ message, errorType }</c>. The frontend's jsonRequest helper throws on
/// any non-2xx and keeps only message/errorType, so an upstream failure
/// returned as 502 discarded the whole audit and surfaced as
/// "Request failed (502)" — hence 200 + ok/outcome here.
/// </para>
/// <para>
/// A send with no eligible recipients reports ok=true, outcome="sent" and
/// totalRecipients=0; there is nothing to fail.
/// </para>
/// </summary>
public class SendAuditDto
{
    public string NewsletterId { get; set; } = "";
    public string SentAt { get; set; } = "";
    public string AdminId { get; set; } = "";
    public int TotalRecipients { get; set; }
    public int Sent { get; set; }
    public int Failed { get; set; }
    public int FailedTotal { get; set; }
    public int Batches { get; set; }
    public bool TestMode { get; set; }
    public string Kind { get; set; } = "send";
    public bool Ok { get; set; }
    public string Outcome { get; set; } = "sent";
    // Email addresses when this DTO describes the send the caller just
    // triggered, member ids when it is rebuilt from a stored audit.
    public List<string> FailedRecipients { get; set; } = new();
    // The persisted (capped) member ids — what /resend-failed will act on.
    public List<string> FailedRecipientIds { get; set; } = new();
    public List<string> Errors { get; set; } = new();

    public static SendAuditDto From(string newsletterId, NewsletterSendAudit a) => new()
    {
        NewsletterId = newsletterId,
        SentAt = a.SentAt,
        AdminId = a.AdminId,
        TotalRecipients = a.TotalRecipients,
        Sent = a.Sent,
        Failed = a.Failed,
        FailedTotal = a.FailedTotal > 0 ? a.FailedTotal : a.Failed,
        Batches = a.Batches,
        TestMode = a.TestMode,
        Kind = a.Kind,
        Ok = a.Failed == 0,
        Outcome = a.Failed == 0 ? "sent" : (a.Sent > 0 ? "partial" : "all_failed"),
        FailedRecipients = a.FailedRecipientEmails.Count > 0 ? a.FailedRecipientEmails : a.FailedRecipients,
        FailedRecipientIds = a.FailedRecipients,
        Errors = a.Errors,
    };
}
