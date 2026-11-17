using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface IMeetingStore
{
    /// <summary>The saved settings, normalised; the defaults when none were saved yet.</summary>
    Task<MeetingSettings> GetSettingsAsync(CancellationToken ct = default);
    Task SaveSettingsAsync(MeetingSettings settings, CancellationToken ct = default);

    Task<List<MeetingDayOverride>> ListDayOverridesAsync(CancellationToken ct = default);
    Task SaveDayOverrideAsync(MeetingDayOverride day, CancellationToken ct = default);
    Task DeleteDayOverrideAsync(string date, CancellationToken ct = default);

    Task<List<MeetingBooking>> ListBookingsAsync(CancellationToken ct = default);
    Task<MeetingBooking?> GetBookingAsync(string id, CancellationToken ct = default);
    Task SaveBookingAsync(MeetingBooking booking, CancellationToken ct = default);
}

/// <summary>
/// Meeting settings, day overrides and bookings: one Azure table
/// (<see cref="AzureStorageOptions.MeetingsTableName"/>), one partition each. The
/// JSONL fallback needs a file per kind (each store rewrites its whole file), so
/// the three are given their own paths beside the other stores' files.
/// </summary>
public class MeetingStore : IMeetingStore
{
    private readonly SettingsStore _settings;
    private readonly DayStore _days;
    private readonly BookingStore _bookings;
    private readonly MeetingOptions _options;

    public MeetingStore(
        IOptions<AzureStorageOptions> storage,
        IOptions<AuthOptions> auth,
        IOptions<MeetingOptions> options,
        ILogger<MeetingStore> logger)
    {
        _options = options.Value;
        var conn = storage.Value.ConnectionString;
        var table = storage.Value.MeetingsTableName;
        var dir = auth.Value.FilePath is { Length: > 0 } p
            ? Path.GetDirectoryName(p) ?? ""
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".pavillon46");
        var noFile = auth.Value.DisableFileStorage;
        _settings = new SettingsStore(conn, table, Path.Combine(dir, "meeting_settings.jsonl"), noFile, logger);
        _days = new DayStore(conn, table, Path.Combine(dir, "meeting_days.jsonl"), noFile, logger);
        _bookings = new BookingStore(conn, table, Path.Combine(dir, "meeting_bookings.jsonl"), noFile, logger);
    }

    public async Task<MeetingSettings> GetSettingsAsync(CancellationToken ct = default)
    {
        var stored = await _settings.GetByIdAsync(MeetingSettings.SingletonId, ct);
        return MeetingCalendar.Normalize(stored ?? new MeetingSettings { NotifyEmails = _options.DefaultNotifyEmails() });
    }

    public Task SaveSettingsAsync(MeetingSettings settings, CancellationToken ct = default)
    {
        settings.Id = MeetingSettings.SingletonId;
        return _settings.UpsertAsync(MeetingCalendar.Normalize(settings), ct);
    }

    public Task<List<MeetingDayOverride>> ListDayOverridesAsync(CancellationToken ct = default) => _days.ListAsync(ct);

    public Task SaveDayOverrideAsync(MeetingDayOverride day, CancellationToken ct = default) => _days.UpsertAsync(day, ct);

    public Task DeleteDayOverrideAsync(string date, CancellationToken ct = default) => _days.DeleteAsync(date, ct);

    public Task<List<MeetingBooking>> ListBookingsAsync(CancellationToken ct = default) => _bookings.ListAsync(ct);

    public Task<MeetingBooking?> GetBookingAsync(string id, CancellationToken ct = default) => _bookings.GetByIdAsync(id, ct);

    public Task SaveBookingAsync(MeetingBooking booking, CancellationToken ct = default) => _bookings.UpsertAsync(booking, ct);

    private sealed class SettingsStore : JsonTableStore<MeetingSettings>
    {
        public SettingsStore(string conn, string table, string filePath, bool fileDisabled, ILogger logger)
            : base(conn, table, filePath, fileDisabled, logger) { }

        protected override string Partition => "meeting-settings";
        protected override string GetId(MeetingSettings item) => item.Id;
    }

    private sealed class DayStore : JsonTableStore<MeetingDayOverride>
    {
        public DayStore(string conn, string table, string filePath, bool fileDisabled, ILogger logger)
            : base(conn, table, filePath, fileDisabled, logger) { }

        protected override string Partition => "meeting-day";
        protected override string GetId(MeetingDayOverride item) => item.Id;
    }

    private sealed class BookingStore : JsonTableStore<MeetingBooking>
    {
        public BookingStore(string conn, string table, string filePath, bool fileDisabled, ILogger logger)
            : base(conn, table, filePath, fileDisabled, logger) { }

        protected override string Partition => "meeting-booking";
        protected override string GetId(MeetingBooking item) => item.Id;
    }
}
