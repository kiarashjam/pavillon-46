using System.Collections.Concurrent;
using System.Text.Json;
using Azure;
using Azure.Data.Tables;

namespace Pavillon46.Api.Services;

/// <summary>
/// Small reusable persistence base. Each record is stored as a JSON blob in an
/// Azure Table entity (PartitionKey = <see cref="Partition"/>, RowKey = record id).
/// When Azure Storage is not configured it falls back to a JSONL file, and then
/// to an in-memory dictionary — the same resilience strategy as ActivityStore.
/// Record counts here (members, applicants of an invitation-only club) are small,
/// so reads load the partition and filter in memory.
/// </summary>
public abstract class JsonTableStore<T> where T : class
{
    private readonly string _connectionString;
    private readonly string _tableName;
    private readonly string _explicitFilePath;
    private readonly bool _fileDisabled;
    private readonly ILogger _logger;

    private TableClient? _client;
    private readonly SemaphoreSlim _init = new(1, 1);
    private readonly SemaphoreSlim _fileLock = new(1, 1);
    private readonly ConcurrentDictionary<string, T> _memory = new(StringComparer.OrdinalIgnoreCase);
    // Serialises the memory fallback's compare-and-swap. The dictionary itself
    // is concurrent, but "read the stamp, compare, replace" must be atomic.
    private readonly object _memoryGate = new();

    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNamingPolicy = null };

    protected JsonTableStore(string connectionString, string tableName, string explicitFilePath, bool fileDisabled, ILogger logger)
    {
        _connectionString = connectionString;
        _tableName = tableName;
        _explicitFilePath = explicitFilePath;
        _fileDisabled = fileDisabled;
        _logger = logger;
    }

    protected abstract string Partition { get; }
    protected abstract string GetId(T item);

    /// <summary>
    /// Concurrency stamp carried by the record itself, used by
    /// <see cref="TryUpdateIfUnchangedAsync"/> on the FILE and MEMORY fallbacks
    /// (the Azure path uses the row's real ETag instead and never consults
    /// this). Stores whose model has no stamp field leave these two hooks
    /// unimplemented and get last-writer-wins semantics on the fallbacks — the
    /// conditional primitive is only meaningful for models that carry a stamp
    /// (see <c>Newsletter.RowVersion</c>).
    /// </summary>
    protected virtual string? GetConcurrencyToken(T item) => null;

    /// <summary>Counterpart of <see cref="GetConcurrencyToken"/>; called on
    /// every successful conditional write so the next reader sees a fresh
    /// token.</summary>
    protected virtual void SetConcurrencyToken(T item, string token) { }

    private bool HasAzure => !string.IsNullOrWhiteSpace(_connectionString);
    private bool HasFile => !_fileDisabled;

    private string ResolveFilePath()
    {
        if (!string.IsNullOrWhiteSpace(_explicitFilePath)) return _explicitFilePath;
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        return Path.Combine(home, ".pavillon46", $"{_tableName.ToLowerInvariant()}.jsonl");
    }

    private async Task<TableClient?> GetTableClientAsync()
    {
        if (!HasAzure) return null;
        if (_client is not null) return _client;
        await _init.WaitAsync();
        try
        {
            if (_client is null)
            {
                var client = new TableClient(_connectionString, _tableName);
                await client.CreateIfNotExistsAsync();
                _client = client;
            }
        }
        finally
        {
            _init.Release();
        }
        return _client;
    }

    public async Task UpsertAsync(T item, CancellationToken ct = default)
    {
        var id = GetId(item);
        var client = await GetTableClientAsync();
        if (client is not null)
        {
            var entity = new TableEntity(Partition, id)
            {
                ["data"] = JsonSerializer.Serialize(item, JsonOpts),
            };
            await client.UpsertEntityAsync(entity, TableUpdateMode.Replace, ct);
            return;
        }

        if (HasFile)
        {
            try
            {
                await RewriteFileAsync(item, id, ct);
                return;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "{Table} file write failed, falling back to memory", _tableName);
            }
        }

        _memory[id] = item;
    }

    // ---- optimistic concurrency ----------------------------------------
    // UpsertAsync is an unconditional Replace: two requests that read the same
    // row and both write it lose one another's changes silently. The pair below
    // adds a compare-and-swap so a caller can hold a window open across an
    // expensive operation (claiming a newsletter send before dispatch, say):
    // read with GetWithEtagAsync, mutate, then TryUpdateIfUnchangedAsync — which
    // returns false, rather than clobbering, when anything else wrote the row in
    // between. Both are additive; UpsertAsync keeps its existing semantics for
    // every current caller.
    //
    // Caveat on the fallbacks: Azure compares a real ETag, which every write
    // moves, while the file/memory paths compare a stamp that only a successful
    // conditional write bumps. An unconditional UpsertAsync therefore stays
    // invisible to a pending conditional write there. That is acceptable for
    // what this guards (two sends of the same newsletter both go through the
    // conditional path); it is not a general-purpose transaction.

    /// <summary>
    /// Reads one record together with the concurrency token to hand back to
    /// <see cref="TryUpdateIfUnchangedAsync"/>. On the Azure path the token is
    /// the entity's real ETag; on the file/memory fallbacks it is the record's
    /// own stamp (see <see cref="GetConcurrencyToken"/>). Returns (null, null)
    /// when the record does not exist.
    /// <para>
    /// Unlike <see cref="GetByIdAsync"/> this is a point read, so on the Azure
    /// path the id must be the canonical, correctly-cased RowKey (Table Storage
    /// RowKeys are case-sensitive) — the same expectation
    /// <see cref="DeleteAsync"/> already documents. A differently-cased id reads
    /// as "not found" rather than being written back under a second RowKey.
    /// </para>
    /// </summary>
    public async Task<(T? Item, string? ETag)> GetWithEtagAsync(string id, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(id)) return (null, null);

        var client = await GetTableClientAsync();
        if (client is not null)
        {
            try
            {
                var response = await client.GetEntityAsync<TableEntity>(Partition, id, cancellationToken: ct);
                var entity = response.Value;
                var json = entity.GetString("data");
                if (string.IsNullOrEmpty(json)) return (null, null);
                var item = JsonSerializer.Deserialize<T>(json, JsonOpts);
                if (item is null) return (null, null);
                return (item, entity.ETag.ToString());
            }
            catch (RequestFailedException ex) when (ex.Status == 404)
            {
                return (null, null);
            }
            catch (JsonException)
            {
                return (null, null);
            }
        }

        if (HasFile)
        {
            try
            {
                var map = await ReadFileAsync(ct);
                if (!map.TryGetValue(id, out var stored)) return (null, null);
                return (stored, GetConcurrencyToken(stored) ?? "");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "{Table} file read failed, falling back to memory", _tableName);
            }
        }

        if (!_memory.TryGetValue(id, out var inMemory)) return (null, null);
        // Hand back a copy: the memory fallback otherwise returns the very
        // reference it stores, so a caller mutating the record would mutate the
        // stored row too and the compare-and-swap below could never detect it.
        var copy = Clone(inMemory);
        if (copy is null) return (null, null);
        return (copy, GetConcurrencyToken(copy) ?? "");
    }

    /// <summary>
    /// Writes <paramref name="item"/> only if the stored record is still the one
    /// <paramref name="expectedEtag"/> came from. Returns false — never throws —
    /// when the row moved underneath us (Azure 412), vanished (404), or its
    /// stamp no longer matches on the file/memory fallbacks.
    /// </summary>
    public async Task<bool> TryUpdateIfUnchangedAsync(T item, string? expectedEtag, CancellationToken ct = default)
    {
        var id = GetId(item);
        if (string.IsNullOrWhiteSpace(id)) return false;

        var client = await GetTableClientAsync();
        if (client is not null)
        {
            // No token means "overwrite whatever is there", which is precisely
            // the race this primitive exists to close — refuse instead.
            if (string.IsNullOrWhiteSpace(expectedEtag)) return false;

            var entity = new TableEntity(Partition, id)
            {
                ["data"] = JsonSerializer.Serialize(item, JsonOpts),
            };
            try
            {
                await client.UpdateEntityAsync(entity, new ETag(expectedEtag), TableUpdateMode.Replace, ct);
                return true;
            }
            catch (RequestFailedException ex) when (ex.Status == 412 || ex.Status == 404)
            {
                return false;
            }
        }

        if (HasFile)
        {
            try
            {
                return await TryUpdateFileIfUnchangedAsync(item, id, expectedEtag, ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "{Table} conditional file write failed, falling back to memory", _tableName);
            }
        }

        lock (_memoryGate)
        {
            if (!_memory.TryGetValue(id, out var current)) return false;
            if (!TokensMatch(GetConcurrencyToken(current), expectedEtag)) return false;
            SetConcurrencyToken(item, NewConcurrencyToken());
            _memory[id] = item;
            return true;
        }
    }

    private async Task<bool> TryUpdateFileIfUnchangedAsync(T item, string id, string? expectedEtag, CancellationToken ct)
    {
        var path = ResolveFilePath();
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

        await _fileLock.WaitAsync(ct);
        try
        {
            var map = await ReadFileAsync(ct);
            if (!map.TryGetValue(id, out var current)) return false;
            if (!TokensMatch(GetConcurrencyToken(current), expectedEtag)) return false;

            SetConcurrencyToken(item, NewConcurrencyToken());
            map[id] = item;
            await WriteMapAsync(path, map, ct);
            return true;
        }
        finally
        {
            _fileLock.Release();
        }
    }

    private static string NewConcurrencyToken() => Guid.NewGuid().ToString("N");

    // A record written before the stamp existed has none; treat null and empty
    // as the same "unstamped" value so the first conditional write succeeds.
    private static bool TokensMatch(string? stored, string? expected) =>
        string.Equals(stored ?? "", expected ?? "", StringComparison.Ordinal);

    private static T? Clone(T item)
    {
        try
        {
            return JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(item, JsonOpts), JsonOpts);
        }
        catch
        {
            return null;
        }
    }

    public async Task<List<T>> ListAsync(CancellationToken ct = default)
    {
        var client = await GetTableClientAsync();
        if (client is not null)
        {
            var results = new List<T>();
            await foreach (var entity in client.QueryAsync<TableEntity>(e => e.PartitionKey == Partition, cancellationToken: ct))
            {
                var json = entity.GetString("data");
                if (string.IsNullOrEmpty(json)) continue;
                try
                {
                    var item = JsonSerializer.Deserialize<T>(json, JsonOpts);
                    if (item is not null) results.Add(item);
                }
                catch { /* skip malformed */ }
            }
            return results;
        }

        if (HasFile)
        {
            try
            {
                return (await ReadFileAsync(ct)).Values.ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "{Table} file read failed, falling back to memory", _tableName);
            }
        }

        return _memory.Values.ToList();
    }

    public async Task<T?> GetByIdAsync(string id, CancellationToken ct = default)
    {
        var all = await ListAsync(ct);
        return all.FirstOrDefault(x => string.Equals(GetId(x), id, StringComparison.OrdinalIgnoreCase));
    }

    // Expects the canonical stored id. Azure Table RowKeys are case-sensitive, so a
    // differently-cased id (which GetByIdAsync would still match) would not delete the
    // Azure row — callers should pass the id loaded from the store (the controller does).
    public async Task DeleteAsync(string id, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(id)) return;

        var client = await GetTableClientAsync();
        if (client is not null)
        {
            try
            {
                await client.DeleteEntityAsync(Partition, id, ETag.All, ct);
            }
            catch (RequestFailedException ex) when (ex.Status == 404)
            {
                // Already gone — treat a delete of a missing row as success.
            }
            return;
        }

        if (HasFile)
        {
            try
            {
                await DeleteFromFileAsync(id, ct);
                return;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "{Table} file delete failed, falling back to memory", _tableName);
            }
        }

        _memory.TryRemove(id, out _);
    }

    // ---- file fallback helpers (full rewrite keyed by id; small data sets) ----

    private async Task<Dictionary<string, T>> ReadFileAsync(CancellationToken ct)
    {
        var map = new Dictionary<string, T>(StringComparer.OrdinalIgnoreCase);
        var path = ResolveFilePath();
        if (!File.Exists(path)) return map;

        var lines = await File.ReadAllLinesAsync(path, ct);
        foreach (var line in lines)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            try
            {
                var item = JsonSerializer.Deserialize<T>(line, JsonOpts);
                if (item is not null) map[GetId(item)] = item;
            }
            catch { /* skip malformed */ }
        }
        return map;
    }

    private async Task RewriteFileAsync(T item, string id, CancellationToken ct)
    {
        var path = ResolveFilePath();
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

        await _fileLock.WaitAsync(ct);
        try
        {
            var map = await ReadFileAsync(ct);
            map[id] = item;
            await WriteMapAsync(path, map, ct);
        }
        finally
        {
            _fileLock.Release();
        }
    }

    // Caller must hold _fileLock.
    private static async Task WriteMapAsync(string path, Dictionary<string, T> map, CancellationToken ct)
    {
        var sb = new System.Text.StringBuilder();
        foreach (var value in map.Values)
        {
            sb.Append(JsonSerializer.Serialize(value, JsonOpts)).Append('\n');
        }
        await File.WriteAllTextAsync(path, sb.ToString(), ct);
    }

    private async Task DeleteFromFileAsync(string id, CancellationToken ct)
    {
        var path = ResolveFilePath();
        if (!File.Exists(path)) return;

        await _fileLock.WaitAsync(ct);
        try
        {
            var map = await ReadFileAsync(ct);
            if (!map.Remove(id)) return;
            var sb = new System.Text.StringBuilder();
            foreach (var value in map.Values)
            {
                sb.Append(JsonSerializer.Serialize(value, JsonOpts)).Append('\n');
            }
            await File.WriteAllTextAsync(path, sb.ToString(), ct);
        }
        finally
        {
            _fileLock.Release();
        }
    }
}
