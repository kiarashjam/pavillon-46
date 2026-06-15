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
    private readonly ConcurrentDictionary<string, T> _memory = new();

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
