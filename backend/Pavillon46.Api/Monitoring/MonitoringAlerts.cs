namespace Pavillon46.Api.Monitoring;

/// <summary>
/// The signals an Application Insights alert rule watches for, agreed with the
/// CadenceE side. Each is logged as <c>monitoring.alert {Signal} {Count} {Detail}</c>.
/// </summary>
public static class MonitoringSignals
{
    /// <summary>The meetings sync gave up on a booking: CadenceE refused it, or it ran out of retries.</summary>
    public const string CadenceSyncFailed = "cadence.sync.failed";

    /// <summary>CadenceE refused a report on a handoff's callback (a wrong secret or token, a 4xx).</summary>
    public const string CadenceHandoffRefused = "cadence.handoff.refused";
}

public interface IMonitoringAlerts
{
    /// <summary>
    /// Records one occurrence of <paramref name="signal"/>, and logs the alert
    /// line unless one was logged for it within the last hour. Never throws.
    /// <paramref name="detail"/> is ids and counts only, never a person.
    /// </summary>
    void Raise(string signal, string detail);
}

/// <summary>
/// At most one alert line per signal per hour, so a CRM outage that fails every
/// booking pages once rather than once per booking. {Count} is how many times
/// the signal occurred since its previous line, this one included; occurrences
/// held back are counted into the next line, not lost. Per instance.
/// </summary>
public sealed class MonitoringAlerts : IMonitoringAlerts
{
    public static readonly TimeSpan Window = TimeSpan.FromHours(1);

    private readonly object _gate = new();
    private readonly Dictionary<string, (DateTimeOffset? LoggedAt, int Count)> _signals = new(StringComparer.Ordinal);
    private readonly ILogger<MonitoringAlerts> _logger;

    public MonitoringAlerts(ILogger<MonitoringAlerts> logger) => _logger = logger;

    public void Raise(string signal, string detail)
    {
        try
        {
            int count;
            var now = DateTimeOffset.UtcNow;
            lock (_gate)
            {
                _signals.TryGetValue(signal, out var state);
                state.Count += 1;
                if (state.LoggedAt is { } last && now - last < Window)
                {
                    _signals[signal] = state;
                    return;
                }
                count = state.Count;
                _signals[signal] = (now, 0);
            }
            _logger.LogWarning("monitoring.alert {Signal} {Count} {Detail}", signal, count, detail);
        }
        catch
        {
            // Monitoring must never break the work it watches.
        }
    }
}
