using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface INewsletterStore
{
    Task<Newsletter> UpsertAsync(Newsletter newsletter, CancellationToken ct = default);
    Task<Newsletter?> GetByIdAsync(string id, CancellationToken ct = default);
    Task<List<Newsletter>> ListAsync(CancellationToken ct = default);
    Task DeleteAsync(string id, CancellationToken ct = default);

    /// <summary>
    /// Reads a newsletter together with the concurrency token needed by
    /// <see cref="TryUpdateIfUnchangedAsync"/>. Used by the send flow to claim a
    /// newsletter before dispatch.
    /// </summary>
    Task<(Newsletter? Newsletter, string? ETag)> GetWithEtagAsync(string id, CancellationToken ct = default);

    /// <summary>
    /// Compare-and-swap write: persists the newsletter only while the stored row
    /// is still the one <paramref name="expectedEtag"/> came from. Returns false
    /// instead of clobbering a concurrent change, and never throws on a
    /// conflict. This is what makes the send claim atomic across instances.
    /// </summary>
    Task<bool> TryUpdateIfUnchangedAsync(Newsletter newsletter, string? expectedEtag, CancellationToken ct = default);
}

/// <summary>
/// Persists <see cref="Newsletter"/> rows with the same Azure Table → JSONL file
/// → in-memory fallback ladder as the other member-side stores (MemberStore,
/// ApplicantStore, PasswordResetTokenStore). Newsletter counts are small — a
/// full partition scan per read is fine and matches the existing pattern.
/// </summary>
public class NewsletterStore : INewsletterStore
{
    private readonly InnerStore _inner;

    public NewsletterStore(
        IOptions<AzureStorageOptions> storage,
        IOptions<AuthOptions> auth,
        ILogger<NewsletterStore> logger)
    {
        _inner = new InnerStore(
            storage.Value.ConnectionString,
            storage.Value.NewslettersTableName,
            auth.Value.FilePath is { Length: > 0 } p
                ? Path.Combine(Path.GetDirectoryName(p) ?? "", "newsletters.jsonl")
                : "",
            auth.Value.DisableFileStorage,
            logger);
    }

    public async Task<Newsletter> UpsertAsync(Newsletter newsletter, CancellationToken ct = default)
    {
        await _inner.UpsertAsync(newsletter, ct);
        return newsletter;
    }

    public Task<Newsletter?> GetByIdAsync(string id, CancellationToken ct = default) =>
        _inner.GetByIdAsync(id, ct);

    public Task<List<Newsletter>> ListAsync(CancellationToken ct = default) => _inner.ListAsync(ct);

    public Task DeleteAsync(string id, CancellationToken ct = default) => _inner.DeleteAsync(id, ct);

    public Task<(Newsletter? Newsletter, string? ETag)> GetWithEtagAsync(string id, CancellationToken ct = default) =>
        _inner.GetWithEtagAsync(id, ct);

    public Task<bool> TryUpdateIfUnchangedAsync(Newsletter newsletter, string? expectedEtag, CancellationToken ct = default) =>
        _inner.TryUpdateIfUnchangedAsync(newsletter, expectedEtag, ct);

    private sealed class InnerStore : JsonTableStore<Newsletter>
    {
        public InnerStore(string conn, string table, string filePath, bool fileDisabled, ILogger logger)
            : base(conn, table, filePath, fileDisabled, logger) { }

        protected override string Partition => "newsletter";
        protected override string GetId(Newsletter item) => item.Id;

        // The file and in-memory fallbacks have no ETag of their own, so the
        // conditional write compares this stamp instead. On Azure the row's real
        // ETag is used and these two are never consulted.
        protected override string? GetConcurrencyToken(Newsletter item) => item.RowVersion;
        protected override void SetConcurrencyToken(Newsletter item, string token) => item.RowVersion = token;
    }
}
