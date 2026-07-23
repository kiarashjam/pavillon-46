using System.Collections.Concurrent;

namespace Pavillon46.Api.Services;

/// <summary>
/// Sliding-window rate limiter keyed on an arbitrary (bucket, key) pair, with
/// per-call limits. Complements the global <see cref="RateLimiter"/> — that one
/// enforces a single (MaxEvents, WindowMs) across all callers; this one lets a
/// caller enforce different budgets on different logical buckets (e.g. per
/// email vs per IP vs per token hash) in-memory.
/// </summary>
public class KeyedRateLimiter
{
    private sealed class Bucket
    {
        public long WindowStart;
        public int Count;
    }

    private readonly ConcurrentDictionary<string, Bucket> _buckets = new();

    /// <summary>
    /// Increments the counter for (bucketName, key) and returns true if the
    /// caller has exceeded <paramref name="maxEvents"/> within the sliding
    /// window of <paramref name="windowMs"/> ms.
    /// </summary>
    public bool IsRateLimited(string bucketName, string key, int maxEvents, int windowMs)
    {
        var composed = bucketName + "|" + key;
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var bucket = _buckets.AddOrUpdate(composed,
            _ => new Bucket { WindowStart = now, Count = 1 },
            (_, existing) =>
            {
                lock (existing)
                {
                    if (now - existing.WindowStart > windowMs)
                    {
                        existing.WindowStart = now;
                        existing.Count = 1;
                    }
                    else
                    {
                        existing.Count += 1;
                    }
                }
                return existing;
            });

        return bucket.Count > maxEvents;
    }
}
