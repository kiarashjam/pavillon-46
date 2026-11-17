using System.Globalization;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

/// <summary>
/// The slot maths for meeting booking, kept pure (no I/O, "now" passed in) so
/// the rules read in one place. Every date and time is wall-clock
/// Europe/Zurich: the club is there, and so is everyone who meets it.
/// </summary>
public static class MeetingCalendar
{
    public const string TimeZoneId = "Europe/Zurich";

    public const int MinSlotMinutes = 10;
    public const int MaxSlotMinutes = 240;
    public const int MaxNoticeHours = 24 * 30;
    public const int MinHorizonDays = 1;
    public const int MaxHorizonDays = 365;

    // Windows hosts without ICU know Zurich only by its Windows id.
    public static TimeZoneInfo Zurich { get; } =
        TimeZoneInfo.TryFindSystemTimeZoneById(TimeZoneId, out var tz) ? tz
        : TimeZoneInfo.TryFindSystemTimeZoneById("W. Europe Standard Time", out var win) ? win
        : TimeZoneInfo.Utc;

    public static bool TryParseDate(string? value, out DateOnly date) =>
        DateOnly.TryParseExact((value ?? "").Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);

    public static bool TryParseTime(string? value, out TimeOnly time) =>
        TimeOnly.TryParseExact((value ?? "").Trim(), "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out time);

    public static string FormatDate(DateOnly date) => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    public static string FormatTime(TimeOnly time) => time.ToString("HH:mm", CultureInfo.InvariantCulture);

    public static DateOnly TodayInZurich(DateTime utcNow) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc), Zurich));

    /// <summary>
    /// The instant a Zurich wall-clock time names, with its offset (+01:00 in
    /// winter, +02:00 in summer). Null for a time the spring-forward skips
    /// (02:00–02:59 on the last Sunday of March), which is never offered as a
    /// slot. A time the autumn fall-back repeats (02:00–02:59 on the last Sunday
    /// of October) is always read as its first occurrence, summer time (+02:00),
    /// so the same slot always names the same instant.
    /// </summary>
    public static DateTimeOffset? ToInstant(DateOnly date, TimeOnly time)
    {
        var local = date.ToDateTime(time, DateTimeKind.Unspecified);
        if (Zurich.IsInvalidTime(local)) return null;
        var offset = Zurich.IsAmbiguousTime(local)
            ? Zurich.GetAmbiguousTimeOffsets(local).Max()
            : Zurich.GetUtcOffset(local);
        return new DateTimeOffset(local, offset);
    }

    /// <summary>
    /// Like <see cref="ToInstant"/>, but never empty-handed: a skipped time moves
    /// forward past the gap, as a wall clock does (02:30 → 03:30 +02:00).
    /// </summary>
    public static DateTimeOffset ResolveInstant(DateOnly date, TimeOnly time)
    {
        var local = date.ToDateTime(time, DateTimeKind.Unspecified);
        for (var i = 0; i < 24 * 60 && Zurich.IsInvalidTime(local); i++) local = local.AddMinutes(1);
        if (Zurich.IsInvalidTime(local)) local = date.ToDateTime(time, DateTimeKind.Unspecified);
        var offset = Zurich.IsAmbiguousTime(local)
            ? Zurich.GetAmbiguousTimeOffsets(local).Max()
            : Zurich.GetUtcOffset(local);
        return new DateTimeOffset(local, offset);
    }

    /// <summary>
    /// "2026-11-20T10:00:00+01:00": always a full ISO 8601 date and time with its
    /// offset (the CRM refuses anything less). "" only for a stored date or time
    /// that does not parse, which validation never lets in.
    /// </summary>
    public static string StartsAt(string date, string time) =>
        TryParseDate(date, out var d) && TryParseTime(time, out var t)
            ? ResolveInstant(d, t).ToString("yyyy-MM-dd'T'HH:mm:sszzz", CultureInfo.InvariantCulture)
            : "";

    /// <summary>ISO weekday, 1 = Monday … 7 = Sunday.</summary>
    public static int IsoDay(DateOnly date) => date.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)date.DayOfWeek;

    public static bool IsStatus(string? value) => value is "open" or "full" or "closed";

    /// <summary>
    /// Brings a stored or submitted settings record within bounds: seven
    /// weekdays, Monday first; a slot length, notice and horizon in range;
    /// clean, unique notification addresses.
    /// </summary>
    public static MeetingSettings Normalize(MeetingSettings s)
    {
        var defaults = MeetingWeekday.Defaults();
        var byDay = (s.Weekdays ?? new()).Where(w => w is not null && w.Day is >= 1 and <= 7)
            .GroupBy(w => w.Day).ToDictionary(g => g.Key, g => g.Last());
        s.Weekdays = defaults.Select(d => byDay.TryGetValue(d.Day, out var w)
            ? new MeetingWeekday
            {
                Day = d.Day,
                Open = w.Open,
                From = TryParseTime(w.From, out var f) ? FormatTime(f) : d.From,
                To = TryParseTime(w.To, out var t) ? FormatTime(t) : d.To,
            }
            : d).ToList();
        s.SlotMinutes = Math.Clamp(s.SlotMinutes <= 0 ? 45 : s.SlotMinutes, MinSlotMinutes, MaxSlotMinutes);
        s.MinNoticeHours = Math.Clamp(s.MinNoticeHours, 0, MaxNoticeHours);
        s.HorizonDays = Math.Clamp(s.HorizonDays, MinHorizonDays, MaxHorizonDays);
        s.NotifyEmails = (s.NotifyEmails ?? new())
            .Select(e => (e ?? "").Trim())
            .Where(e => e.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        return s;
    }

    /// <summary>What one date looks like, to the public and to the team.</summary>
    public sealed record DayPlan(
        DateOnly Date,
        // What the public sees: "open" (bookable now), "full" or "closed".
        string Status,
        // What the team set for the date (override, else weekday): "open" | "full" | "closed".
        string Configured,
        // "override" when the team set this date apart, else "weekday".
        string Source,
        bool WeekdayOpen,
        string From,
        string To,
        // Free slots, "HH:mm", in order. Empty unless Status is "open".
        IReadOnlyList<string> FreeSlots,
        // Every slot the hours hold, booked or not.
        int SlotCount,
        // Bookings (status "booked") on this date.
        int Bookings);

    /// <summary>
    /// Plans one date. Public status: closed when the date is past, beyond the
    /// horizon, closed by its weekday or an override, has no slot in its hours,
    /// or every slot starts within the minimum notice; full when the team marked
    /// it full or every bookable slot is taken; open otherwise, with the free
    /// slots. A slot is taken when any booking overlaps it, so bookings made
    /// before the slot length changed still block the time they hold.
    /// </summary>
    public static DayPlan PlanDay(
        DateOnly date,
        MeetingSettings settings,
        MeetingDayOverride? dayOverride,
        IEnumerable<MeetingBooking> bookings,
        DateTime utcNow)
    {
        var weekday = settings.Weekdays.FirstOrDefault(w => w.Day == IsoDay(date))
            ?? MeetingWeekday.Defaults()[IsoDay(date) - 1];
        var hasOverride = dayOverride is not null && IsStatus(dayOverride.Status);
        var configured = hasOverride ? dayOverride!.Status : (weekday.Open ? "open" : "closed");
        var source = hasOverride ? "override" : "weekday";

        var booked = bookings
            .Where(b => b.IsBooked() && b.Date == FormatDate(date) && TryParseTime(b.Time, out _))
            .Select(b =>
            {
                TryParseTime(b.Time, out var t);
                var start = t.Hour * 60 + t.Minute;
                return (Start: start, End: start + Math.Max(1, b.DurationMinutes));
            })
            .ToList();

        // The day's slots. A start the spring-forward skips does not exist on
        // the clock, so it is not a slot at all (ToInstant is null for it).
        var grid = new List<TimeOnly>();
        var slot = settings.SlotMinutes;
        if (TryParseTime(weekday.From, out var from) && TryParseTime(weekday.To, out var to) && slot > 0)
        {
            var end = to.Hour * 60 + to.Minute;
            for (var m = from.Hour * 60 + from.Minute; m + slot <= end; m += slot)
            {
                var start = new TimeOnly(m / 60, m % 60);
                if (ToInstant(date, start) is not null) grid.Add(start);
            }
        }

        DayPlan Plan(string status, IReadOnlyList<string> free) => new(
            date, status, configured, source, weekday.Open, weekday.From, weekday.To, free, grid.Count, booked.Count);

        var today = TodayInZurich(utcNow);
        if (date < today || date > today.AddDays(settings.HorizonDays) || configured == "closed" || grid.Count == 0)
            return Plan("closed", Array.Empty<string>());
        if (configured == "full")
            return Plan("full", Array.Empty<string>());

        var earliest = new DateTimeOffset(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc)).AddHours(settings.MinNoticeHours);
        var bookable = grid.Where(t => ToInstant(date, t)!.Value >= earliest).ToList();
        if (bookable.Count == 0)
            return Plan("closed", Array.Empty<string>());

        var free = bookable
            .Where(t =>
            {
                var start = t.Hour * 60 + t.Minute;
                return !booked.Any(b => start < b.End && b.Start < start + slot);
            })
            .Select(FormatTime)
            .ToList();
        return Plan(free.Count == 0 ? "full" : "open", free);
    }
}
