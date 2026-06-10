using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;
using Azure;
using Azure.Data.Tables;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;
using Pavillon46.Api.Privacy;

namespace Pavillon46.Api.Services;

public class ActivityStore : IActivityStore
{
    private readonly ActivityOptions _activity;
    private readonly AzureStorageOptions _storage;
    private readonly ILogger<ActivityStore> _logger;
    private readonly ConcurrentQueue<ActivityEvent> _inMemory = new();
    private TableClient? _tableClient;
    private readonly SemaphoreSlim _tableInit = new(1, 1);
    private readonly SemaphoreSlim _fileLock = new(1, 1);

    public ActivityStore(
        IOptions<ActivityOptions> activity,
        IOptions<AzureStorageOptions> storage,
        ILogger<ActivityStore> logger)
    {
        _activity = activity.Value;
        _storage = storage.Value;
        _logger = logger;
    }

    private bool HasAzure => !string.IsNullOrWhiteSpace(_storage.ConnectionString);
    private bool HasFile => !_activity.DisableFileStorage;

    private string ResolveFilePath()
    {
        if (!string.IsNullOrWhiteSpace(_activity.FilePath)) return _activity.FilePath;
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        return Path.Combine(home, ".pavillon46", "activity-events.jsonl");
    }

    private async Task<TableClient?> GetTableClientAsync()
    {
        if (!HasAzure) return null;
        if (_tableClient is not null) return _tableClient;
        await _tableInit.WaitAsync();
        try
        {
            if (_tableClient is null)
            {
                var client = new TableClient(_storage.ConnectionString, _storage.TableName);
                await client.CreateIfNotExistsAsync();
                _tableClient = client;
            }
        }
        finally
        {
            _tableInit.Release();
        }
        return _tableClient;
    }

    private static string Clamp(string? value, int max) =>
        string.IsNullOrEmpty(value) ? "" : (value.Length <= max ? value : value[..max]);

    private static string ToIso(string? value)
    {
        if (DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var dt))
        {
            return dt.UtcDateTime.ToString("o");
        }
        return DateTime.UtcNow.ToString("o");
    }

    private static long ParseTs(string? value)
    {
        if (DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var dt))
        {
            return dt.ToUnixTimeMilliseconds();
        }
        return 0;
    }

    private static TableEntity MapToEntity(ActivityEvent ev)
    {
        var ts = ToIso(ev.Ts);
        var rowKey = $"{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}-{Guid.NewGuid()}";
        var partition = ts.Length >= 10 ? ts[..10] : DateTime.UtcNow.ToString("yyyy-MM-dd");
        var entity = new TableEntity(partition, rowKey)
        {
            ["type"] = Clamp(ev.Type, 32),
            ["path"] = Clamp(ev.Path, 512),
            ["ts"] = ts,
            ["sessionId"] = Clamp(ev.SessionId, 120),
            ["userAgent"] = Clamp(PrivacyHelpers.PublicUserAgent(ev.UserAgent), 300),
            ["referrer"] = Clamp(PrivacyHelpers.PublicReferrer(ev.Referrer), 300),
            ["ipHash"] = Clamp(ev.IpHash, 120),
            ["elementTag"] = Clamp(ev.Element?.Tag, 80),
            ["elementId"] = Clamp(ev.Element?.Id, 120),
            ["elementText"] = Clamp(PrivacyHelpers.PublicClickText(ev.Element?.Text, 48), 220),
        };
        return entity;
    }

    private static ActivityEvent MapFromEntity(TableEntity entity)
    {
        return new ActivityEvent
        {
            Id = entity.RowKey,
            Type = entity.GetString("type") ?? "unknown",
            Path = entity.GetString("path") ?? "/",
            Ts = entity.GetString("ts") ?? (entity.Timestamp?.UtcDateTime.ToString("o") ?? DateTime.UtcNow.ToString("o")),
            SessionId = entity.GetString("sessionId") ?? "",
            UserAgent = entity.GetString("userAgent") ?? "",
            Referrer = entity.GetString("referrer") ?? "",
            IpHash = entity.GetString("ipHash") ?? "",
            Element = new ActivityElement
            {
                Tag = entity.GetString("elementTag") ?? "",
                Id = entity.GetString("elementId") ?? "",
                Text = entity.GetString("elementText") ?? "",
            },
        };
    }

    public async Task RecordEventAsync(ActivityEvent ev, CancellationToken ct = default)
    {
        var client = await GetTableClientAsync();
        if (client is not null)
        {
            await client.AddEntityAsync(MapToEntity(ev), ct);
            return;
        }

        if (HasFile)
        {
            try
            {
                await AppendToFileAsync(ev, ct);
                return;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Activity file write failed, falling back to memory");
            }
        }

        _inMemory.Enqueue(ev);
        while (_inMemory.Count > Math.Max(50000, _activity.MaxInMemoryEvents))
        {
            _inMemory.TryDequeue(out _);
        }
    }

    private async Task AppendToFileAsync(ActivityEvent ev, CancellationToken ct)
    {
        var filePath = ResolveFilePath();
        var dir = Path.GetDirectoryName(filePath);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

        await _fileLock.WaitAsync(ct);
        try
        {
            var json = JsonSerializer.Serialize(ev);
            await File.AppendAllTextAsync(filePath, json + "\n", ct);
        }
        finally
        {
            _fileLock.Release();
        }
    }

    private async Task<List<ActivityEvent>> ReadEventsFromFileAsync(int maxScan, CancellationToken ct)
    {
        var filePath = ResolveFilePath();
        var events = new List<ActivityEvent>();
        if (!File.Exists(filePath)) return events;

        var lines = await File.ReadAllLinesAsync(filePath, ct);
        for (var i = lines.Length - 1; i >= 0; i--)
        {
            var line = lines[i];
            if (string.IsNullOrWhiteSpace(line)) continue;
            try
            {
                var parsed = JsonSerializer.Deserialize<ActivityEvent>(line);
                if (parsed is not null) events.Add(parsed);
            }
            catch { /* skip malformed */ }
            if (events.Count >= maxScan) break;
        }
        return events;
    }

    public async Task<ActivityReport> GetReportAsync(ActivityReportFilters filters, CancellationToken ct = default)
    {
        var maxScan = _activity.MaxScan == 0 ? int.MaxValue : Math.Max(5000, _activity.MaxScan);

        List<ActivityEvent> events;
        string storage;

        var tableClient = await GetTableClientAsync();
        if (tableClient is not null)
        {
            events = new List<ActivityEvent>();
            await foreach (var entity in tableClient.QueryAsync<TableEntity>(cancellationToken: ct))
            {
                events.Add(MapFromEntity(entity));
                if (events.Count >= maxScan) break;
            }
            storage = "azure-table";
        }
        else if (HasFile)
        {
            try
            {
                events = await ReadEventsFromFileAsync(maxScan, ct);
                storage = "file";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Activity file read failed, falling back to memory");
                events = _inMemory.Reverse().ToList();
                storage = "memory";
            }
        }
        else
        {
            events = _inMemory.Reverse().ToList();
            storage = "memory";
        }

        foreach (var ev in events)
        {
            PrivacyHelpers.SanitizeEventForPrivacy(ev);
        }

        var filtered = ApplyFilters(events, filters);
        var sortedAll = events.OrderByDescending(e => ParseTs(e.Ts)).ToList();

        return new ActivityReport
        {
            Events = filtered,
            Summary = Summarize(filtered),
            Storage = storage,
            Meta = new ActivityMeta
            {
                ScannedEvents = events.Count,
                MaxScan = maxScan == int.MaxValue ? null : maxScan,
                Truncated = events.Count >= maxScan,
                LatestEventTs = sortedAll.FirstOrDefault()?.Ts,
                OldestEventTs = sortedAll.LastOrDefault()?.Ts,
            }
        };
    }

    private List<ActivityEvent> ApplyFilters(List<ActivityEvent> events, ActivityReportFilters filters)
    {
        long? fromTs = string.IsNullOrEmpty(filters.From) ? null : ParseTs(filters.From);
        long? toTs = string.IsNullOrEmpty(filters.To) ? null : ParseTs(filters.To);
        var pathNeedle = (filters.Path ?? "").Trim().ToLowerInvariant();

        var filtered = events.Where(ev =>
        {
            var t = ParseTs(ev.Ts);
            if (fromTs is not null && t < fromTs) return false;
            if (toTs is not null && t > toTs) return false;
            if (!string.IsNullOrEmpty(filters.Type) && filters.Type != "all" && ev.Type != filters.Type) return false;
            if (!string.IsNullOrEmpty(pathNeedle) && !(ev.Path ?? "").ToLowerInvariant().Contains(pathNeedle)) return false;
            return true;
        }).ToList();

        var limit = Math.Clamp(filters.Limit <= 0 ? 300 : filters.Limit, 1, _activity.MaxReportLimit);

        return filtered
            .OrderByDescending(e => ParseTs(e.Ts))
            .Take(limit)
            .ToList();
    }

    private static ActivitySummary Summarize(List<ActivityEvent> events)
    {
        var pageCounts = new Dictionary<string, int>();
        var clickCounts = new Dictionary<string, int>();
        var sessions = new HashSet<string>();

        foreach (var ev in events)
        {
            if (!string.IsNullOrEmpty(ev.SessionId)) sessions.Add(ev.SessionId);
            if (!string.IsNullOrEmpty(ev.Path))
            {
                pageCounts[ev.Path] = pageCounts.GetValueOrDefault(ev.Path) + 1;
            }
            if (ev.Type == "click")
            {
                var parts = new List<string>();
                if (!string.IsNullOrEmpty(ev.Element?.Tag)) parts.Add(ev.Element.Tag);
                var idOrText = !string.IsNullOrEmpty(ev.Element?.Id) ? ev.Element.Id : ev.Element?.Text ?? "";
                if (!string.IsNullOrEmpty(idOrText)) parts.Add(idOrText);
                var label = parts.Count > 0 ? string.Join(" - ", parts) : "(unknown element)";
                clickCounts[label] = clickCounts.GetValueOrDefault(label) + 1;
            }
        }

        return new ActivitySummary
        {
            TotalEvents = events.Count,
            PageViews = events.Count(e => e.Type == "page_view"),
            Clicks = events.Count(e => e.Type == "click"),
            UniqueSessions = sessions.Count,
            TopPages = pageCounts.OrderByDescending(p => p.Value).Take(8).Select(p => new RankedPath(p.Key, p.Value)).ToList(),
            TopClicks = clickCounts.OrderByDescending(p => p.Value).Take(8).Select(p => new RankedLabel(p.Key, p.Value)).ToList(),
        };
    }
}
