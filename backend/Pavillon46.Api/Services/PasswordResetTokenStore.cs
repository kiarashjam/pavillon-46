using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface IPasswordResetTokenStore
{
    Task UpsertAsync(PasswordResetToken row, CancellationToken ct = default);
    Task<PasswordResetToken?> GetByHashAsync(string tokenHash, CancellationToken ct = default);
    Task<IReadOnlyList<PasswordResetToken>> ListActiveByMemberIdAsync(string memberId, CancellationToken ct = default);
    Task InvalidateAllForMemberAsync(string memberId, string reason, CancellationToken ct = default, string? audience = null);
}

/// <summary>
/// Persists <see cref="PasswordResetToken"/> rows keyed by their SHA-256 hash.
/// Follows the same Azure Table → JSONL file → in-memory fallback pattern as
/// <see cref="MemberStore"/> / <see cref="ApplicantStore"/>. Rows are small and
/// short-lived so a full-partition scan for the by-member lookups is acceptable.
/// </summary>
public class PasswordResetTokenStore : IPasswordResetTokenStore
{
    private readonly InnerStore _inner;

    public PasswordResetTokenStore(
        IOptions<AzureStorageOptions> storage,
        IOptions<AuthOptions> auth,
        ILogger<PasswordResetTokenStore> logger)
    {
        _inner = new InnerStore(
            storage.Value.ConnectionString,
            storage.Value.PasswordResetTokensTableName,
            auth.Value.FilePath is { Length: > 0 } p
                ? Path.Combine(Path.GetDirectoryName(p) ?? "", "password_reset_tokens.jsonl")
                : "",
            auth.Value.DisableFileStorage,
            logger);
    }

    public Task UpsertAsync(PasswordResetToken row, CancellationToken ct = default)
    {
        // Keep Id/TokenHash in sync — the store keys by Id.
        if (string.IsNullOrEmpty(row.Id)) row.Id = row.TokenHash;
        return _inner.UpsertAsync(row, ct);
    }

    public async Task<PasswordResetToken?> GetByHashAsync(string tokenHash, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(tokenHash)) return null;
        // The RowKey is the canonical (lowercase) hex hash. Look up directly.
        return await _inner.GetByIdAsync(tokenHash, ct);
    }

    public async Task<IReadOnlyList<PasswordResetToken>> ListActiveByMemberIdAsync(string memberId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(memberId)) return Array.Empty<PasswordResetToken>();

        var nowUtc = DateTime.UtcNow;
        var all = await _inner.ListAsync(ct);
        return all
            .Where(t => string.Equals(t.MemberId, memberId, StringComparison.OrdinalIgnoreCase))
            .Where(t => t.UsedAtUtc is null)
            .Where(t => TryParseIso(t.ExpiresAtUtc) is DateTime exp && exp > nowUtc)
            .ToList();
    }

    public async Task InvalidateAllForMemberAsync(string memberId, string reason, CancellationToken ct = default, string? audience = null)
    {
        if (string.IsNullOrWhiteSpace(memberId)) return;

        var active = await ListActiveByMemberIdAsync(memberId, ct);
        if (!string.IsNullOrWhiteSpace(audience))
        {
            active = active
                .Where(t => string.Equals(t.Audience, audience, StringComparison.OrdinalIgnoreCase)
                    || (audience == "member" && string.IsNullOrWhiteSpace(t.Audience)))
                .ToList();
        }
        if (active.Count == 0) return;

        var now = DateTime.UtcNow.ToString("o");
        foreach (var row in active)
        {
            row.UsedAtUtc = now;
            row.UsedReason = string.IsNullOrEmpty(reason) ? "invalidated" : reason;
            await _inner.UpsertAsync(row, ct);
        }
    }

    private static DateTime? TryParseIso(string s) =>
        DateTime.TryParse(s, null, System.Globalization.DateTimeStyles.RoundtripKind, out var dt)
            ? dt.ToUniversalTime()
            : null;

    private sealed class InnerStore : JsonTableStore<PasswordResetToken>
    {
        public InnerStore(string conn, string table, string filePath, bool fileDisabled, ILogger logger)
            : base(conn, table, filePath, fileDisabled, logger) { }

        protected override string Partition => "reset";
        protected override string GetId(PasswordResetToken item) => item.Id;
    }
}
