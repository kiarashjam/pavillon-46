using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface IAdminStore
{
    Task<Admin> UpsertAsync(Admin admin, CancellationToken ct = default);
    Task<Admin?> GetByIdAsync(string id, CancellationToken ct = default);
    Task<Admin?> GetByEmailAsync(string email, CancellationToken ct = default);
    Task<List<Admin>> ListAsync(CancellationToken ct = default);
    Task DeleteAsync(string id, CancellationToken ct = default);
}

/// <summary>
/// Persists admin accounts. Mirrors <see cref="MemberStore"/> exactly — same
/// Azure Table → JSONL file → in-memory fallback — but in its own partition /
/// table so admins never mingle with members.
/// </summary>
public class AdminStore : IAdminStore
{
    private readonly InnerStore _inner;

    public AdminStore(IOptions<AzureStorageOptions> storage, IOptions<AuthOptions> auth, ILogger<AdminStore> logger)
    {
        _inner = new InnerStore(
            storage.Value.ConnectionString,
            storage.Value.AdminsTableName,
            auth.Value.FilePath is { Length: > 0 } p ? Path.Combine(Path.GetDirectoryName(p) ?? "", "admins.jsonl") : "",
            auth.Value.DisableFileStorage,
            logger);
    }

    public async Task<Admin> UpsertAsync(Admin admin, CancellationToken ct = default)
    {
        await _inner.UpsertAsync(admin, ct);
        return admin;
    }

    public Task<Admin?> GetByIdAsync(string id, CancellationToken ct = default) =>
        _inner.GetByIdAsync(id, ct);

    public async Task<Admin?> GetByEmailAsync(string email, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(email)) return null;
        var needle = email.Trim().ToLowerInvariant();
        var all = await _inner.ListAsync(ct);
        return all.FirstOrDefault(a => a.Email.Trim().ToLowerInvariant() == needle);
    }

    public Task<List<Admin>> ListAsync(CancellationToken ct = default) => _inner.ListAsync(ct);

    public Task DeleteAsync(string id, CancellationToken ct = default) => _inner.DeleteAsync(id, ct);

    private sealed class InnerStore : JsonTableStore<Admin>
    {
        public InnerStore(string conn, string table, string filePath, bool fileDisabled, ILogger logger)
            : base(conn, table, filePath, fileDisabled, logger) { }

        protected override string Partition => "admin";
        protected override string GetId(Admin item) => item.Id;
    }
}
