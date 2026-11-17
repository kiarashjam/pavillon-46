using Microsoft.AspNetCore.Mvc;
using Pavillon46.Api.Models;
using Pavillon46.Api.Services;

namespace Pavillon46.Api.Controllers;

/// <summary>
/// The public booking page (/rendez-vous, /en/meeting): free slots, the
/// CadenceE invitation behind a personal link, and the booking itself.
/// Anonymous. See backend/README.md for the contract.
/// </summary>
[ApiController]
[Route("api/meetings")]
public class MeetingsController : ControllerBase
{
    // Wide enough for three months of calendar in one call.
    public const int MaxRangeDays = 92;

    private const int BookPerIpMax = 10;
    private const int BookPerIpWindowMs = 15 * 60_000;
    private const int BookPerEmailMax = 5;
    private const int BookPerEmailWindowMs = 60 * 60_000;
    private const int InvitePerIpMax = 60;
    private const int InvitePerIpWindowMs = 60_000;

    private readonly IMeetingService _meetings;
    private readonly IMeetingInviteService _invites;
    private readonly KeyedRateLimiter _rateLimiter;

    public MeetingsController(IMeetingService meetings, IMeetingInviteService invites, KeyedRateLimiter rateLimiter)
    {
        _meetings = meetings;
        _invites = invites;
        _rateLimiter = rateLimiter;
    }

    /// <summary>Parses a from/to pair: both dates, in order, at most <see cref="MaxRangeDays"/> days.</summary>
    internal static bool TryRange(string? from, string? to, out DateOnly start, out DateOnly end)
    {
        end = default;
        return MeetingCalendar.TryParseDate(from, out start)
            && MeetingCalendar.TryParseDate(to, out end)
            && end >= start
            && end.DayNumber - start.DayNumber < MaxRangeDays;
    }

    [HttpGet("availability")]
    public async Task<IActionResult> Availability([FromQuery] string? from, [FromQuery] string? to, CancellationToken ct)
    {
        if (!TryRange(from, to, out var start, out var end))
        {
            return BadRequest(new
            {
                message = $"Give from and to as yyyy-MM-dd, at most {MaxRangeDays} days apart.",
                errorType = "invalid_range",
            });
        }

        var (settings, days) = await _meetings.PlanAsync(start, end, ct);
        var today = MeetingCalendar.TodayInZurich(DateTime.UtcNow);
        return Ok(new
        {
            timeZone = MeetingCalendar.TimeZoneId,
            slotMinutes = settings.SlotMinutes,
            // So the calendar knows where "today" and the last bookable day are
            // in Zurich, whatever the visitor's own clock says.
            today = MeetingCalendar.FormatDate(today),
            lastDate = MeetingCalendar.FormatDate(today.AddDays(settings.HorizonDays)),
            days = days.Select(d => new
            {
                date = MeetingCalendar.FormatDate(d.Date),
                status = d.Status,
                slots = d.FreeSlots,
            }),
        });
    }

    [HttpGet("invite")]
    public IActionResult Invite([FromQuery] string? token)
    {
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        if (_rateLimiter.IsRateLimited("meetings:invite:ip", ip, InvitePerIpMax, InvitePerIpWindowMs))
        {
            return StatusCode(429, new { message = "Too many requests. Please try again later." });
        }

        var invite = _invites.Verify(token);
        if (invite is null) return Ok(new { valid = false });
        return Ok(new
        {
            valid = true,
            firstName = invite.FirstName,
            lastName = invite.LastName,
            email = invite.Email,
            code = invite.Code,
        });
    }

    [HttpPost("bookings")]
    public async Task<IActionResult> Book([FromBody] MeetingBookingRequest? body, CancellationToken ct)
    {
        if (body is null) return BadRequest(new { message = "Invalid request body.", errorType = "invalid_booking" });

        var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var emailKey = (body.Email ?? "").Trim().ToLowerInvariant();
        if (_rateLimiter.IsRateLimited("meetings:book:ip", ip, BookPerIpMax, BookPerIpWindowMs)
            || (emailKey.Length > 0 && _rateLimiter.IsRateLimited("meetings:book:email", emailKey, BookPerEmailMax, BookPerEmailWindowMs)))
        {
            return StatusCode(429, new { message = "Too many bookings. Please try again later.", errorType = "rate_limited" });
        }

        var result = await _meetings.BookAsync(body, ct);
        if (result.Booking is not { } b)
        {
            return StatusCode(result.Status, new { message = result.Message, errorType = result.ErrorType, field = result.Field });
        }
        return Ok(new
        {
            id = b.Id,
            date = b.Date,
            time = b.Time,
            durationMinutes = b.DurationMinutes,
            startsAt = MeetingCalendar.StartsAt(b.Date, b.Time),
        });
    }
}
