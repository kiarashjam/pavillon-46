namespace Pavillon46.Api.Models;

// ---------------------------------------------------------------------------
// Meeting booking: a prospect opens /rendez-vous (often from a CadenceE
// invitation), picks a free slot and books it. The team decides in the admin
// console which days are open, full or closed, and the hours. All dates and
// times here are wall-clock Europe/Zurich ("yyyy-MM-dd", "HH:mm"); see
// MeetingCalendar for the slot maths. backend/README.md has the contract.
// ---------------------------------------------------------------------------

/// <summary>The one settings record (RowKey <see cref="SingletonId"/>).</summary>
public class MeetingSettings
{
    public const string SingletonId = "settings";

    public string Id { get; set; } = SingletonId;
    public int SlotMinutes { get; set; } = 45;
    // Always seven entries after MeetingCalendar.Normalize, Monday (1) to Sunday (7).
    public List<MeetingWeekday> Weekdays { get; set; } = MeetingWeekday.Defaults();
    // A slot starting sooner than this from now cannot be booked.
    public int MinNoticeHours { get; set; } = 24;
    // The last bookable day is today + HorizonDays (Zurich).
    public int HorizonDays { get; set; } = 60;
    // Who is told about each booking. Empty in a stored record means "nobody";
    // a store with no record yet uses MeetingOptions.NotifyEmails.
    public List<string> NotifyEmails { get; set; } = new();
    public string UpdatedAt { get; set; } = "";
}

/// <summary>
/// One weekday's rule. The hours are kept while the day is off, so an override
/// that opens a single Saturday knows which hours to offer.
/// </summary>
public class MeetingWeekday
{
    // ISO weekday: 1 = Monday … 7 = Sunday.
    public int Day { get; set; }
    public bool Open { get; set; }
    public string From { get; set; } = "10:00";
    public string To { get; set; } = "18:00";

    public static List<MeetingWeekday> Defaults() =>
        Enumerable.Range(1, 7)
            .Select(d => new MeetingWeekday { Day = d, Open = d <= 5, From = "10:00", To = "18:00" })
            .ToList();
}

/// <summary>
/// A date the team set apart from its weekday rule. "open" opens it (with that
/// weekday's hours), "full" shows it as full, "closed" closes it. A date with no
/// override follows its weekday.
/// </summary>
public class MeetingDayOverride
{
    // "yyyy-MM-dd". JsonTableStore<T> uses this as the RowKey.
    public string Id { get; set; } = "";
    public string Status { get; set; } = "";
    public string UpdatedAt { get; set; } = "";
}

public class MeetingBooking
{
    public string Id { get; set; } = "";
    public string Date { get; set; } = "";
    public string Time { get; set; } = "";
    public int DurationMinutes { get; set; }
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Message { get; set; } = "";
    public string Language { get; set; } = "fr";
    // From a valid CadenceE invitation; empty for a direct booking.
    public string CrmLeadId { get; set; } = "";
    public string CrmOrganizationId { get; set; } = "";
    public string Code { get; set; } = "";
    // The invitation's "u": where this booking (and its cancellation) is posted.
    // Never returned by an endpoint.
    public string CrmBaseUrl { get; set; } = "";
    // "booked" | "cancelled"
    public string Status { get; set; } = "booked";
    public string CreatedAt { get; set; } = "";
    public string CancelledAt { get; set; } = "";

    // ---- CadenceE sync (MeetingCrmNotifier) ----
    // The status the CRM last acknowledged ("booked" | "cancelled"); the booking
    // is in sync when it equals Status. Kept on the row so a restart, or a CRM
    // that is down for hours, loses nothing: the sweep resends what is not.
    public string CrmSyncedStatus { get; set; } = "";
    public string CrmSyncedAt { get; set; } = "";
    public string CrmLastError { get; set; } = "";
    // Set when the CRM refused the post (400, 401, 404, …): resending as it is
    // would only repeat the refusal, so only an admin's "Send again" does.
    public bool CrmHalted { get; set; }
    // Failed delivery rounds so far, and when the sweep may try again.
    public int CrmFailedRounds { get; set; }
    public string CrmNextAttemptAt { get; set; } = "";

    public bool IsBooked() => string.Equals(Status, "booked", StringComparison.OrdinalIgnoreCase);
    public bool FromInvitation() => !string.IsNullOrWhiteSpace(CrmLeadId);
}

/// <summary>A verified CadenceE invitation token (see MeetingInviteService).</summary>
public sealed record MeetingInvite(
    string OrganizationId,
    string LeadId,
    string FirstName,
    string LastName,
    string Email,
    string Code,
    string CrmBaseUrl,
    DateTimeOffset ExpiresAt);

public record MeetingBookingRequest(
    string? Date,
    string? Time,
    string? FirstName,
    string? LastName,
    string? Email,
    string? Phone,
    string? Message,
    string? Language,
    string? Invite);

public record MeetingSettingsRequest(
    int? SlotMinutes,
    List<MeetingWeekdayRequest>? Weekdays,
    int? MinNoticeHours,
    int? HorizonDays,
    List<string>? NotifyEmails);

public record MeetingWeekdayRequest(int Day, bool Open, string? From, string? To);

public record MeetingDayRequest(string? Status);

// What the admin console sees of a booking: everything but the CRM address.
public record MeetingBookingDto(
    string Id,
    string Date,
    string Time,
    int DurationMinutes,
    string StartsAt,
    string FirstName,
    string LastName,
    string Email,
    string Phone,
    string Message,
    string Language,
    string CrmLeadId,
    string CrmOrganizationId,
    string Code,
    string Status,
    string CreatedAt,
    string? CancelledAt,
    MeetingCrmState Crm)
{
    public static MeetingBookingDto From(MeetingBooking b, string startsAt, MeetingCrmState crm) => new(
        b.Id, b.Date, b.Time, b.DurationMinutes, startsAt, b.FirstName, b.LastName, b.Email, b.Phone,
        b.Message, b.Language, b.CrmLeadId, b.CrmOrganizationId, b.Code, b.Status, b.CreatedAt,
        string.IsNullOrEmpty(b.CancelledAt) ? null : b.CancelledAt, crm);
}

/// <summary>
/// Where a booking goes in CadenceE and whether it got there. Channel:
/// "invitation" (posted to the CRM that sent the invitation), "cadence" (a
/// walk-in posted to CADENCE_CRM_URL), "leads-webhook" (a walk-in sent as a
/// lead) or "none" (nothing to send, e.g. a cancelled walk-in with no CRM URL).
/// </summary>
public record MeetingCrmState(
    string Channel,
    bool Pending,
    bool Halted,
    string? SyncedAt,
    string? LastError,
    string? NextAttemptAt);
