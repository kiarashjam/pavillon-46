namespace Pavillon46.Api.Monitoring;

/// <summary>
/// Proof that a background loop is still turning: the loop calls
/// <see cref="Beat"/> at the end of every pass, and <c>/health</c> reads it. Used
/// by the meetings CRM sweep (<c>MeetingCrmNotifier</c>), which would otherwise
/// stop silently: its loop swallows errors so one bad pass doesn't end it.
/// </summary>
public sealed class SweepHeartbeat
{
    // A loop is stalled once it has missed this many of its intervals.
    public const int StalledAfterIntervals = 3;

    private readonly DateTimeOffset _since = DateTimeOffset.UtcNow;
    private long _lastBeatTicks;
    private int _lastOk = 1;

    public SweepHeartbeat(TimeSpan interval) => Interval = interval;

    /// <summary>How often the loop runs.</summary>
    public TimeSpan Interval { get; }

    /// <summary>A pass has finished; <paramref name="ok"/> is false when it failed.</summary>
    public void Beat(bool ok)
    {
        Volatile.Write(ref _lastOk, ok ? 1 : 0);
        Interlocked.Exchange(ref _lastBeatTicks, DateTimeOffset.UtcNow.UtcTicks);
    }

    /// <summary>When the last pass finished; null before the first one.</summary>
    public DateTimeOffset? LastBeatAt
    {
        get
        {
            var ticks = Interlocked.Read(ref _lastBeatTicks);
            return ticks == 0 ? null : new DateTimeOffset(ticks, TimeSpan.Zero);
        }
    }

    /// <summary>Whether the last pass succeeded (true before the first one).</summary>
    public bool LastOk => Volatile.Read(ref _lastOk) == 1;

    /// <summary>
    /// No pass within <see cref="StalledAfterIntervals"/> intervals — counted from
    /// startup until the first one.
    /// </summary>
    public bool IsStalled(DateTimeOffset now) =>
        now - (LastBeatAt ?? _since) > Interval * StalledAfterIntervals;
}
