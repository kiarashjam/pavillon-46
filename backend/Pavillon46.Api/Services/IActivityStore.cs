using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface IActivityStore
{
    Task RecordEventAsync(ActivityEvent ev, CancellationToken ct = default);
    Task<ActivityReport> GetReportAsync(ActivityReportFilters filters, CancellationToken ct = default);
}
