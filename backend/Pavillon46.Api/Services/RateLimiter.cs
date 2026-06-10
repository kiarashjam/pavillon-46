using System.Collections.Concurrent;

namespace Pavillon46.Api.Services;

public class RateLimiter
{
    private record Bucket(long WindowStart, int Count);

    private readonly ConcurrentDictionary<string, Bucket> _buckets = new();
    public int WindowMs { get; init; } = 15_000;
    public int MaxEvents { get; init; } = 30;

    public bool IsRateLimited(string key)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var bucket = _buckets.AddOrUpdate(key,
            _ => new Bucket(now, 1),
            (_, existing) =>
            {
                if (now - existing.WindowStart > WindowMs)
                {
                    return new Bucket(now, 1);
                }
                return existing with { Count = existing.Count + 1 };
            });

        return bucket.Count > MaxEvents;
    }
}
