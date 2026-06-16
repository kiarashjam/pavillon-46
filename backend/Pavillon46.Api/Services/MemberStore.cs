using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface IMemberStore
{
    Task<Member> UpsertAsync(Member member, CancellationToken ct = default);
    Task<Member?> GetByIdAsync(string id, CancellationToken ct = default);
    Task<Member?> GetByEmailAsync(string email, CancellationToken ct = default);
    Task<Member?> GetByReferralCodeAsync(string code, CancellationToken ct = default);
    Task<List<Member>> ListAsync(CancellationToken ct = default);
    Task DeleteAsync(string id, CancellationToken ct = default);
}

public class MemberStore : IMemberStore
{
    private readonly InnerStore _inner;

    public MemberStore(IOptions<AzureStorageOptions> storage, IOptions<AuthOptions> auth, ILogger<MemberStore> logger)
    {
        _inner = new InnerStore(
            storage.Value.ConnectionString,
            storage.Value.MembersTableName,
            auth.Value.FilePath is { Length: > 0 } p ? Path.Combine(Path.GetDirectoryName(p) ?? "", "members.jsonl") : "",
            auth.Value.DisableFileStorage,
            logger);
    }

    public async Task<Member> UpsertAsync(Member member, CancellationToken ct = default)
    {
        await _inner.UpsertAsync(member, ct);
        return member;
    }

    public Task<Member?> GetByIdAsync(string id, CancellationToken ct = default) =>
        _inner.GetByIdAsync(id, ct);

    public async Task<Member?> GetByEmailAsync(string email, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(email)) return null;
        var needle = email.Trim().ToLowerInvariant();
        var all = await _inner.ListAsync(ct);
        return all.FirstOrDefault(m => m.Email.Trim().ToLowerInvariant() == needle);
    }

    public async Task<Member?> GetByReferralCodeAsync(string code, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(code)) return null;
        var needle = code.Trim().ToUpperInvariant();
        var all = await _inner.ListAsync(ct);
        return all.FirstOrDefault(m => m.ReferralCode.Trim().ToUpperInvariant() == needle);
    }

    public Task<List<Member>> ListAsync(CancellationToken ct = default) => _inner.ListAsync(ct);

    public Task DeleteAsync(string id, CancellationToken ct = default) => _inner.DeleteAsync(id, ct);

    private sealed class InnerStore : JsonTableStore<Member>
    {
        public InnerStore(string conn, string table, string filePath, bool fileDisabled, ILogger logger)
            : base(conn, table, filePath, fileDisabled, logger) { }

        protected override string Partition => "member";
        protected override string GetId(Member item) => item.Id;
    }
}
