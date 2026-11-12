using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface ICadenceEventStore
{
    Task<CadenceEventRecord?> GetAsync(string eventId, CancellationToken ct = default);
    Task SaveAsync(CadenceEventRecord record, CancellationToken ct = default);
}

/// <summary>
/// The CadenceE handoff events already processed, by event id. Same Azure Table
/// → JSONL file → memory fallback as the other stores. The CRM retries one event
/// for about two days at most, so a record older than <see cref="KeepFor"/> is
/// no longer needed and is pruned as new ones arrive.
/// </summary>
public class CadenceEventStore : ICadenceEventStore
{
    internal static readonly TimeSpan KeepFor = TimeSpan.FromDays(30);

    private readonly InnerStore _inner;
    private readonly ILogger<CadenceEventStore> _logger;

    public CadenceEventStore(IOptions<AzureStorageOptions> storage, IOptions<AuthOptions> auth, ILogger<CadenceEventStore> logger)
    {
        _logger = logger;
        _inner = new InnerStore(
            storage.Value.ConnectionString,
            storage.Value.CadenceEventsTableName,
            auth.Value.FilePath is { Length: > 0 } p ? Path.Combine(Path.GetDirectoryName(p) ?? "", "cadence_events.jsonl") : "",
            auth.Value.DisableFileStorage,
            logger);
    }

    public async Task<CadenceEventRecord?> GetAsync(string eventId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(eventId)) return null;
        var row = await _inner.GetByIdAsync(eventId.Trim().ToLowerInvariant(), ct);
        if (row is null) return null;
        return Expired(row) ? null : row;
    }

    public async Task SaveAsync(CadenceEventRecord record, CancellationToken ct = default)
    {
        record.Id = record.Id.Trim().ToLowerInvariant();
        await _inner.UpsertAsync(record, ct);

        // Handoffs are rare (one per won deal), so a scan here costs nothing.
        try
        {
            foreach (var old in (await _inner.ListAsync(ct)).Where(Expired))
                await _inner.DeleteAsync(old.Id, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "cadence.events.prune_failed");
        }
    }

    private static bool Expired(CadenceEventRecord row) =>
        !DateTime.TryParse(row.ReceivedAtUtc, null, System.Globalization.DateTimeStyles.RoundtripKind, out var at)
        || at.ToUniversalTime() < DateTime.UtcNow - KeepFor;

    private sealed class InnerStore : JsonTableStore<CadenceEventRecord>
    {
        public InnerStore(string conn, string table, string filePath, bool fileDisabled, ILogger logger)
            : base(conn, table, filePath, fileDisabled, logger) { }

        protected override string Partition => "cadence";
        protected override string GetId(CadenceEventRecord item) => item.Id;
    }
}
