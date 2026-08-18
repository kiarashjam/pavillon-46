using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface IApplicantStore
{
    Task<Applicant> AddAsync(Applicant applicant, CancellationToken ct = default);
    Task<Applicant> UpsertAsync(Applicant applicant, CancellationToken ct = default);
    Task<Applicant?> GetByIdAsync(string id, CancellationToken ct = default);
    Task<List<Applicant>> ListAsync(CancellationToken ct = default);
    Task<List<Applicant>> ListByReferrerAsync(string memberId, CancellationToken ct = default);
    Task DeleteAsync(string id, CancellationToken ct = default);
}

public class ApplicantStore : IApplicantStore
{
    private readonly InnerStore _inner;

    public ApplicantStore(IOptions<AzureStorageOptions> storage, IOptions<AuthOptions> auth, ILogger<ApplicantStore> logger)
    {
        _inner = new InnerStore(
            storage.Value.ConnectionString,
            storage.Value.ApplicantsTableName,
            auth.Value.FilePath is { Length: > 0 } p ? Path.Combine(Path.GetDirectoryName(p) ?? "", "applicants.jsonl") : "",
            auth.Value.DisableFileStorage,
            logger);
    }

    public Task<Applicant> AddAsync(Applicant applicant, CancellationToken ct = default) => UpsertAsync(applicant, ct);

    public async Task<Applicant> UpsertAsync(Applicant applicant, CancellationToken ct = default)
    {
        await _inner.UpsertAsync(applicant, ct);
        return applicant;
    }

    public Task<Applicant?> GetByIdAsync(string id, CancellationToken ct = default) => _inner.GetByIdAsync(id, ct);

    public async Task<List<Applicant>> ListAsync(CancellationToken ct = default)
    {
        var all = await _inner.ListAsync(ct);
        return all.OrderByDescending(a => a.CreatedAt, StringComparer.Ordinal).ToList();
    }

    public async Task<List<Applicant>> ListByReferrerAsync(string memberId, CancellationToken ct = default)
    {
        var all = await ListAsync(ct);
        return all.Where(a => string.Equals(a.ReferrerMemberId, memberId, StringComparison.OrdinalIgnoreCase)).ToList();
    }

    public Task DeleteAsync(string id, CancellationToken ct = default) => _inner.DeleteAsync(id, ct);

    private sealed class InnerStore : JsonTableStore<Applicant>
    {
        public InnerStore(string conn, string table, string filePath, bool fileDisabled, ILogger logger)
            : base(conn, table, filePath, fileDisabled, logger) { }

        protected override string Partition => "applicant";
        protected override string GetId(Applicant item) => item.Id;
    }
}
