using Microsoft.Extensions.Options;
using Pavillon46.Api.Localization;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface IMeetingService
{
    /// <summary>Plans every date from <paramref name="from"/> to <paramref name="to"/>, inclusive.</summary>
    Task<(MeetingSettings Settings, List<MeetingCalendar.DayPlan> Days)> PlanAsync(DateOnly from, DateOnly to, CancellationToken ct = default);

    Task<MeetingBookingResult> BookAsync(MeetingBookingRequest request, CancellationToken ct = default);

    /// <summary>Cancels a booking, frees its slot, emails the person and tells the CRM. Null when there is no such booking.</summary>
    Task<(MeetingBooking Booking, bool Emailed)?> CancelAsync(string id, CancellationToken ct = default);

    /// <summary>Sets a date's status ("open", "full", "closed", or "default" to follow its weekday again).</summary>
    Task SetDayAsync(DateOnly date, string status, CancellationToken ct = default);
}

public sealed record MeetingBookingResult(
    MeetingBooking? Booking,
    // 400 for invalid input, 409 when the slot is not (or no longer) free.
    int Status,
    string? ErrorType,
    string? Message,
    string? Field = null);

/// <summary>
/// Booking, cancelling and planning. Bookings are checked and saved under one
/// lock, so two people choosing the same slot at the same moment cannot both
/// get it.
/// </summary>
/// <remarks>
/// The lock is in-process: right for the single App Service instance this API
/// runs on. Scaling out would need the check moved into storage (a conditional
/// insert keyed by the slot).
/// </remarks>
public class MeetingService : IMeetingService
{
    private readonly IMeetingStore _store;
    private readonly IMeetingInviteService _invites;
    private readonly IMeetingEmailService _emails;
    private readonly IMeetingCrmNotifier _crm;
    private readonly ILogger<MeetingService> _logger;
    private readonly SemaphoreSlim _bookingGate = new(1, 1);

    public MeetingService(
        IMeetingStore store,
        IMeetingInviteService invites,
        IMeetingEmailService emails,
        IMeetingCrmNotifier crm,
        ILogger<MeetingService> logger)
    {
        _store = store;
        _invites = invites;
        _emails = emails;
        _crm = crm;
        _logger = logger;
    }

    public async Task<(MeetingSettings Settings, List<MeetingCalendar.DayPlan> Days)> PlanAsync(DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        var settings = await _store.GetSettingsAsync(ct);
        var overrides = (await _store.ListDayOverridesAsync(ct))
            .Where(o => !string.IsNullOrEmpty(o.Id))
            .GroupBy(o => o.Id).ToDictionary(g => g.Key, g => g.Last());
        var bookings = (await _store.ListBookingsAsync(ct)).Where(b => b.IsBooked()).ToLookup(b => b.Date);
        var now = DateTime.UtcNow;

        var days = new List<MeetingCalendar.DayPlan>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var key = MeetingCalendar.FormatDate(d);
            days.Add(MeetingCalendar.PlanDay(d, settings, overrides.GetValueOrDefault(key), bookings[key], now));
        }
        return (settings, days);
    }

    public async Task<MeetingBookingResult> BookAsync(MeetingBookingRequest request, CancellationToken ct = default)
    {
        static MeetingBookingResult Invalid(string field, string message) => new(null, 400, "invalid_booking", message, field);

        if (!MeetingCalendar.TryParseDate(request.Date, out var date)) return Invalid("date", "Choose a day.");
        if (!MeetingCalendar.TryParseTime(request.Time, out var time)) return Invalid("time", "Choose a time.");

        // A valid invitation links the booking to its CRM lead; anything else
        // (no token, a forged or expired one) books as a direct visitor.
        var invite = string.IsNullOrWhiteSpace(request.Invite) ? null : _invites.Verify(request.Invite);

        var firstName = MeetingRules.OneLine(request.FirstName);
        var lastName = MeetingRules.OneLine(request.LastName);
        if (firstName.Length == 0 && invite is not null) firstName = invite.FirstName;
        if (lastName.Length == 0 && invite is not null) lastName = invite.LastName;
        // The invitation's address is the one its lead is known by in the CRM.
        var email = invite is { Email.Length: > 0 } ? invite.Email : MeetingRules.OneLine(request.Email);
        var phone = MeetingRules.OneLine(request.Phone);
        var message = MeetingRules.Paragraphs(request.Message);

        if (firstName.Length is 0 or > MeetingRules.MaxNameLength) return Invalid("firstName", "Enter your first name.");
        if (lastName.Length is 0 or > MeetingRules.MaxNameLength) return Invalid("lastName", "Enter your last name.");
        if (!MeetingRules.IsEmail(email)) return Invalid("email", "Enter a valid email address.");
        if (!MeetingRules.IsPhone(phone)) return Invalid("phone", "Enter a valid phone number.");
        if (message.Length > MeetingRules.MaxMessageLength) return Invalid("message", $"Keep the message under {MeetingRules.MaxMessageLength} characters.");

        MeetingBooking booking;
        List<string> notify;
        await _bookingGate.WaitAsync(ct);
        try
        {
            var (settings, days) = await PlanAsync(date, date, ct);
            var plan = days[0];
            var slot = MeetingCalendar.FormatTime(time);
            if (!plan.FreeSlots.Contains(slot))
            {
                return new MeetingBookingResult(null, 409, "slot_unavailable",
                    "This time is no longer available. Please choose another.");
            }

            booking = new MeetingBooking
            {
                Id = Guid.NewGuid().ToString("N"),
                Date = MeetingCalendar.FormatDate(date),
                Time = slot,
                DurationMinutes = settings.SlotMinutes,
                FirstName = firstName,
                LastName = lastName,
                Email = email,
                Phone = phone,
                Message = message,
                Language = EmailTranslations.NormalizeLang(request.Language),
                CrmLeadId = invite?.LeadId ?? "",
                CrmOrganizationId = invite?.OrganizationId ?? "",
                Code = invite?.Code ?? "",
                CrmBaseUrl = invite?.CrmBaseUrl ?? "",
                Status = "booked",
                CreatedAt = DateTime.UtcNow.ToString("o"),
            };
            await _store.SaveBookingAsync(booking, ct);
            notify = settings.NotifyEmails;
        }
        finally
        {
            _bookingGate.Release();
        }

        _logger.LogInformation("meetings.booked booking={Booking} date={Date} time={Time} invitation={Invitation}",
            booking.Id, booking.Date, booking.Time, booking.FromInvitation());

        // Saved: from here nothing may fail the booking. The CRM is told in the
        // background; the two emails are awaited (they log, never throw) so the
        // confirmation is on its way when the page says so.
        _crm.Enqueue(booking);
        await Task.WhenAll(
            _emails.NotifyTeamAsync(booking, notify, CancellationToken.None),
            _emails.SendConfirmationAsync(booking, CancellationToken.None));

        return new MeetingBookingResult(booking, 200, null, null);
    }

    public async Task<(MeetingBooking Booking, bool Emailed)?> CancelAsync(string id, CancellationToken ct = default)
    {
        MeetingBooking? booking;
        await _bookingGate.WaitAsync(ct);
        try
        {
            booking = await _store.GetBookingAsync(id, ct);
            if (booking is null) return null;
            if (!booking.IsBooked()) return (booking, false);
            booking.Status = "cancelled";
            booking.CancelledAt = DateTime.UtcNow.ToString("o");
            await _store.SaveBookingAsync(booking, ct);
        }
        finally
        {
            _bookingGate.Release();
        }

        _logger.LogInformation("meetings.cancelled booking={Booking}", booking.Id);
        _crm.Enqueue(booking);
        var emailed = await _emails.SendCancellationAsync(booking, CancellationToken.None);
        return (booking, emailed);
    }

    public async Task SetDayAsync(DateOnly date, string status, CancellationToken ct = default)
    {
        var settings = await _store.GetSettingsAsync(ct);
        var weekday = settings.Weekdays.First(w => w.Day == MeetingCalendar.IsoDay(date));
        var key = MeetingCalendar.FormatDate(date);
        // The same as the weekday rule needs no override: dropping it keeps the
        // date following its weekday if the weekly hours change later.
        if (status == "default" || status == (weekday.Open ? "open" : "closed"))
        {
            await _store.DeleteDayOverrideAsync(key, ct);
            return;
        }
        await _store.SaveDayOverrideAsync(new MeetingDayOverride
        {
            Id = key,
            Status = status,
            UpdatedAt = DateTime.UtcNow.ToString("o"),
        }, ct);
    }
}
