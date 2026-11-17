using Microsoft.AspNetCore.Mvc;
using Pavillon46.Api.Models;
using Pavillon46.Api.Security;
using Pavillon46.Api.Services;

namespace Pavillon46.Api.Controllers;

/// <summary>
/// The admin console's Meetings section: weekly hours and booking rules, which
/// dates are open, full or closed, and the bookings.
/// </summary>
[ApiController]
[Route("api/admin/meetings")]
[AdminAuthorize]
public class AdminMeetingsController : ControllerBase
{
    private const int MaxNotifyEmails = 10;

    private readonly IMeetingService _meetings;
    private readonly IMeetingStore _store;
    private readonly ILogger<AdminMeetingsController> _logger;

    public AdminMeetingsController(IMeetingService meetings, IMeetingStore store, ILogger<AdminMeetingsController> logger)
    {
        _meetings = meetings;
        _store = store;
        _logger = logger;
    }

    private static object SettingsDto(MeetingSettings s) => new
    {
        timeZone = MeetingCalendar.TimeZoneId,
        slotMinutes = s.SlotMinutes,
        weekdays = s.Weekdays.Select(w => new { day = w.Day, open = w.Open, from = w.From, to = w.To }),
        minNoticeHours = s.MinNoticeHours,
        horizonDays = s.HorizonDays,
        notifyEmails = s.NotifyEmails,
        updatedAt = string.IsNullOrEmpty(s.UpdatedAt) ? null : s.UpdatedAt,
    };

    private static object DayDto(MeetingCalendar.DayPlan d) => new
    {
        date = MeetingCalendar.FormatDate(d.Date),
        status = d.Status,
        configured = d.Configured,
        source = d.Source,
        weekdayOpen = d.WeekdayOpen,
        from = d.From,
        to = d.To,
        slots = d.SlotCount,
        free = d.FreeSlots.Count,
        bookings = d.Bookings,
    };

    private static object Error(string message, string errorType) => new { message, errorType };

    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings(CancellationToken ct) =>
        Ok(SettingsDto(await _store.GetSettingsAsync(ct)));

    [HttpPut("settings")]
    public async Task<IActionResult> UpdateSettings([FromBody] MeetingSettingsRequest? body, CancellationToken ct)
    {
        if (body is null) return BadRequest(Error("Invalid request body.", "invalid_settings"));
        var settings = await _store.GetSettingsAsync(ct);

        if (body.SlotMinutes is { } slot)
        {
            if (slot < MeetingCalendar.MinSlotMinutes || slot > MeetingCalendar.MaxSlotMinutes || slot % 5 != 0)
                return BadRequest(Error($"Slot length must be {MeetingCalendar.MinSlotMinutes}–{MeetingCalendar.MaxSlotMinutes} minutes, in steps of 5.", "invalid_settings"));
            settings.SlotMinutes = slot;
        }
        if (body.MinNoticeHours is { } notice)
        {
            if (notice < 0 || notice > MeetingCalendar.MaxNoticeHours)
                return BadRequest(Error($"Minimum notice must be 0–{MeetingCalendar.MaxNoticeHours} hours.", "invalid_settings"));
            settings.MinNoticeHours = notice;
        }
        if (body.HorizonDays is { } horizon)
        {
            if (horizon < MeetingCalendar.MinHorizonDays || horizon > MeetingCalendar.MaxHorizonDays)
                return BadRequest(Error($"Booking horizon must be {MeetingCalendar.MinHorizonDays}–{MeetingCalendar.MaxHorizonDays} days.", "invalid_settings"));
            settings.HorizonDays = horizon;
        }
        if (body.Weekdays is { } weekdays)
        {
            var next = new List<MeetingWeekday>();
            foreach (var w in weekdays)
            {
                if (w is null || w.Day is < 1 or > 7)
                    return BadRequest(Error("Each weekday needs a day from 1 (Monday) to 7 (Sunday).", "invalid_settings"));
                if (!MeetingCalendar.TryParseTime(w.From, out var from) || !MeetingCalendar.TryParseTime(w.To, out var to) || to <= from)
                    return BadRequest(Error("Each weekday needs hours as HH:mm, the end after the start.", "invalid_settings"));
                next.Add(new MeetingWeekday { Day = w.Day, Open = w.Open, From = MeetingCalendar.FormatTime(from), To = MeetingCalendar.FormatTime(to) });
            }
            if (next.Select(w => w.Day).Distinct().Count() != next.Count)
                return BadRequest(Error("Each weekday may appear once.", "invalid_settings"));
            // Days left out keep their current rule.
            settings.Weekdays = settings.Weekdays.Select(w => next.FirstOrDefault(n => n.Day == w.Day) ?? w).ToList();
        }
        if (body.NotifyEmails is { } emails)
        {
            var clean = emails.Select(e => (e ?? "").Trim()).Where(e => e.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            if (clean.Count > MaxNotifyEmails)
                return BadRequest(Error($"At most {MaxNotifyEmails} notification addresses.", "invalid_settings"));
            if (clean.FirstOrDefault(e => !MeetingRules.IsEmail(e)) is { } bad)
                return BadRequest(Error($"\"{bad}\" is not a valid email address.", "invalid_settings"));
            settings.NotifyEmails = clean;
        }

        settings.UpdatedAt = DateTime.UtcNow.ToString("o");
        await _store.SaveSettingsAsync(settings, ct);
        _logger.LogInformation("meetings.settings.saved by={Admin}", HttpContext.GetAdmin()?.MemberId);
        return Ok(SettingsDto(await _store.GetSettingsAsync(ct)));
    }

    [HttpGet("days")]
    public async Task<IActionResult> ListDays([FromQuery] string? from, [FromQuery] string? to, CancellationToken ct)
    {
        if (!MeetingsController.TryRange(from, to, out var start, out var end))
            return BadRequest(Error($"Give from and to as yyyy-MM-dd, at most {MeetingsController.MaxRangeDays} days apart.", "invalid_range"));

        var (settings, days) = await _meetings.PlanAsync(start, end, ct);
        var today = MeetingCalendar.TodayInZurich(DateTime.UtcNow);
        return Ok(new
        {
            timeZone = MeetingCalendar.TimeZoneId,
            today = MeetingCalendar.FormatDate(today),
            lastDate = MeetingCalendar.FormatDate(today.AddDays(settings.HorizonDays)),
            days = days.Select(DayDto),
        });
    }

    [HttpPut("days/{date}")]
    public async Task<IActionResult> SetDay(string date, [FromBody] MeetingDayRequest? body, CancellationToken ct)
    {
        if (!MeetingCalendar.TryParseDate(date, out var day))
            return BadRequest(Error("The date must be yyyy-MM-dd.", "invalid_date"));
        var status = (body?.Status ?? "").Trim().ToLowerInvariant();
        if (!MeetingCalendar.IsStatus(status) && status != "default")
            return BadRequest(Error("Status must be open, full, closed or default.", "invalid_status"));

        await _meetings.SetDayAsync(day, status, ct);
        _logger.LogInformation("meetings.day.set date={Date} status={Status} by={Admin}", MeetingCalendar.FormatDate(day), status, HttpContext.GetAdmin()?.MemberId);
        var (_, days) = await _meetings.PlanAsync(day, day, ct);
        return Ok(DayDto(days[0]));
    }

    [HttpGet("bookings")]
    public async Task<IActionResult> ListBookings([FromQuery] string? from, [FromQuery] string? to, [FromQuery] string? status, CancellationToken ct)
    {
        DateOnly? start = null, end = null;
        if (!string.IsNullOrWhiteSpace(from))
        {
            if (!MeetingCalendar.TryParseDate(from, out var f)) return BadRequest(Error("from must be yyyy-MM-dd.", "invalid_range"));
            start = f;
        }
        if (!string.IsNullOrWhiteSpace(to))
        {
            if (!MeetingCalendar.TryParseDate(to, out var t)) return BadRequest(Error("to must be yyyy-MM-dd.", "invalid_range"));
            end = t;
        }
        var wanted = (status ?? "all").Trim().ToLowerInvariant();
        if (wanted is not ("all" or "booked" or "cancelled"))
            return BadRequest(Error("status must be all, booked or cancelled.", "invalid_status"));

        var now = DateTimeOffset.UtcNow;
        var rows = (await _store.ListBookingsAsync(ct))
            .Where(b => wanted == "all" || string.Equals(b.Status, wanted, StringComparison.OrdinalIgnoreCase))
            .Select(b => (Booking: b, Date: MeetingCalendar.TryParseDate(b.Date, out var d) ? d : DateOnly.MinValue,
                          StartsAt: MeetingCalendar.StartsAt(b.Date, b.Time)))
            .Where(r => (start is null || r.Date >= start) && (end is null || r.Date <= end))
            .Select(r => (r.Booking, r.StartsAt, Instant: DateTimeOffset.TryParse(r.StartsAt, out var at) ? at : DateTimeOffset.MinValue))
            .ToList();

        // Upcoming first, soonest at the top; then the past, most recent first.
        var upcoming = rows.Where(r => r.Instant >= now).OrderBy(r => r.Instant);
        var past = rows.Where(r => r.Instant < now).OrderByDescending(r => r.Instant);
        var ordered = upcoming.Concat(past).Select(r => MeetingBookingDto.From(r.Booking, r.StartsAt)).ToList();

        return Ok(new
        {
            bookings = ordered,
            total = ordered.Count,
            upcoming = rows.Count(r => r.Instant >= now && r.Booking.IsBooked()),
        });
    }

    [HttpPost("bookings/{id}/cancel")]
    public async Task<IActionResult> Cancel(string id, CancellationToken ct)
    {
        var existing = await _store.GetBookingAsync(id, ct);
        if (existing is null) return NotFound(Error("Booking not found.", "not_found"));
        if (!existing.IsBooked()) return Conflict(Error("This booking is already cancelled.", "already_cancelled"));

        var result = await _meetings.CancelAsync(existing.Id, ct);
        if (result is not { } r) return NotFound(Error("Booking not found.", "not_found"));
        _logger.LogInformation("meetings.cancel booking={Booking} by={Admin}", r.Booking.Id, HttpContext.GetAdmin()?.MemberId);
        return Ok(new
        {
            booking = MeetingBookingDto.From(r.Booking, MeetingCalendar.StartsAt(r.Booking.Date, r.Booking.Time)),
            emailed = r.Emailed,
        });
    }
}
