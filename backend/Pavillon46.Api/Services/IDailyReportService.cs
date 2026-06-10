namespace Pavillon46.Api.Services;

public record DailyReportResult(
    bool Ok,
    string? Skipped,
    string ReportDay,
    string? To,
    bool ActivityDataUnchanged,
    int TotalEvents,
    int UniqueSessions,
    int PageViews,
    int Clicks
);

public interface IDailyReportService
{
    Task<DailyReportResult> SendAsync(string? dayOverride, CancellationToken ct = default);
}
