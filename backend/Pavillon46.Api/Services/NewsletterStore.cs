using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface INewsletterStore
{
    Task<Newsletter> UpsertAsync(Newsletter newsletter, CancellationToken ct = default);
    Task<Newsletter?> GetByIdAsync(string id, CancellationToken ct = default);
    Task<List<Newsletter>> ListAsync(CancellationToken ct = default);
    Task DeleteAsync(string id, CancellationToken ct = default);
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

    private sealed class InnerStore : JsonTableStore<Newsletter>
    {
        public InnerStore(string conn, string table, string filePath, bool fileDisabled, ILogger logger)
            : base(conn, table, filePath, fileDisabled, logger) { }

        protected override string Partition => "newsletter";
        protected override string GetId(Newsletter item) => item.Id;
    }
}
