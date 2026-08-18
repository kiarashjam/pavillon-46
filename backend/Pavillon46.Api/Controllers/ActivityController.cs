using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;
using Pavillon46.Api.Security;
using Pavillon46.Api.Services;

namespace Pavillon46.Api.Controllers;

[ApiController]
[Route("api/activity")]
public class ActivityController : ControllerBase
{
    private readonly IActivityStore _store;
    private readonly IDailyReportService _dailyReport;
    private readonly RateLimiter _rateLimiter;
    private readonly ActivityOptions _options;
    private readonly ITokenService _tokens;
    private readonly IAdminStore _admins;
    private readonly ILogger<ActivityController> _logger;

    public ActivityController(
        IActivityStore store,
        IDailyReportService dailyReport,
        RateLimiter rateLimiter,
        IOptions<ActivityOptions> options,
        ITokenService tokens,
        IAdminStore admins,
        ILogger<ActivityController> logger)
    {
        _store = store;
        _dailyReport = dailyReport;
        _rateLimiter = rateLimiter;
        _options = options.Value;
        _tokens = tokens;
        _admins = admins;
        _logger = logger;
    }

    private string GetClientIp()
    {
        // ForwardedHeadersMiddleware (see Program.cs) writes the real client IP
        // into RemoteIpAddress once the proxy-set XFF passes its trust check.
        // Reading the raw header would let a caller poison the rate-limit key
        // and the hashed IP that lands in the activity table.
        return HttpContext.Connection.RemoteIpAddress?.ToString() ?? "";
    }

    private string HashIp(string ip)
    {
        var bytes = Encoding.UTF8.GetBytes($"{_options.IpSalt}:{ip}");
        return Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    }

    private async Task<bool> IsAuthorizedAsync(CancellationToken ct)
    {
        // Preferred: a valid admin session token from the admin console.
        var authHeader = Request.Headers.Authorization.ToString();
        if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            var principal = _tokens.Validate(authHeader["Bearer ".Length..].Trim());
            if (principal is not null && principal.IsAdmin)
            {
                var admin = await _admins.GetByIdAsync(principal.MemberId, ct);
                if (admin is not null
                    && string.Equals(admin.Status, "active", StringComparison.OrdinalIgnoreCase)
                    && admin.PasswordVersion == principal.PasswordVersion)
                {
                    return true;
                }
            }
        }

        // Legacy report key — still accepted for the daily-report cron and any
        // external tooling that calls the report endpoint directly.
        var expected = _options.ReportKey;
        if (string.IsNullOrEmpty(expected)) return false;
        var provided =
            Request.Headers["x-report-key"].ToString() ??
            Request.Headers["x-daily-report-key"].ToString() ??
            Request.Query["key"].ToString() ??
            Request.Cookies["activity_report_key"] ?? "";
        return provided == expected;
    }

    private static string Clamp(string? value, int max)
    {
        if (string.IsNullOrEmpty(value)) return "";
        return value.Length <= max ? value : value[..max];
    }

    [HttpPost("log")]
    public async Task<IActionResult> Log([FromBody] ActivityLogRequest? body, CancellationToken ct)
    {
        if (!_options.Enabled)
        {
            return Ok(new { ok = true, skipped = "disabled" });
        }

        body ??= new ActivityLogRequest();
        var type = body.Type == "click" ? "click" : "page_view";
        var sessionId = Clamp(body.SessionId, 120);
        var ip = GetClientIp();
        var bucketKey = $"{ip}:{(string.IsNullOrEmpty(sessionId) ? "anon" : sessionId)}";

        if (_rateLimiter.IsRateLimited(bucketKey))
        {
            return StatusCode(429, new { message = "Rate limit exceeded" });
        }

        var ev = new ActivityEvent
        {
            Type = type,
            Path = Clamp(body.Path, 512),
            Ts = string.IsNullOrEmpty(body.Ts) ? DateTime.UtcNow.ToString("o") : body.Ts!,
            SessionId = sessionId,
            UserAgent = Clamp(Request.Headers.UserAgent.ToString(), 300),
            Referrer = Clamp(Request.Headers.Referer.ToString(), 300),
            IpHash = HashIp(ip),
            Element = new ActivityElement
            {
                Tag = Clamp(body.Element?.Tag, 80),
                Id = Clamp(body.Element?.Id, 120),
                Text = Clamp(body.Element?.Text, 220),
            }
        };

        try
        {
            await _store.RecordEventAsync(ev, ct);
            return Ok(new { ok = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Activity log error");
            return StatusCode(500, new { message = "Failed to store activity event" });
        }
    }

    [HttpGet("report")]
    public async Task<IActionResult> Report(
        [FromQuery] string? from,
        [FromQuery] string? to,
        [FromQuery] string type = "all",
        [FromQuery] string path = "",
        [FromQuery] int limit = 300,
        CancellationToken ct = default)
    {
        if (!await IsAuthorizedAsync(ct)) return Unauthorized(new { message = "Unauthorized" });

        try
        {
            var report = await _store.GetReportAsync(new ActivityReportFilters
            {
                From = from,
                To = to,
                Type = type,
                Path = path,
                Limit = limit,
            }, ct);
            return Ok(report);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Activity report error");
            return StatusCode(500, new { message = "Failed to load activity report" });
        }
    }

    [HttpPost("daily-report")]
    [HttpGet("daily-report")]
    public async Task<IActionResult> DailyReport([FromQuery] string? day, CancellationToken ct)
    {
        if (!await IsAuthorizedAsync(ct)) return Unauthorized(new { message = "Unauthorized" });

        try
        {
            var result = await _dailyReport.SendAsync(day, ct);
            if (result.Skipped == "already-sent")
            {
                return Ok(new { ok = true, skipped = "already-sent", reportDay = result.ReportDay, activityDataUnchanged = true });
            }
            return Ok(new
            {
                ok = true,
                reportDay = result.ReportDay,
                to = result.To,
                activityDataUnchanged = true,
                totals = new
                {
                    totalEvents = result.TotalEvents,
                    uniqueSessions = result.UniqueSessions,
                    pageViews = result.PageViews,
                    clicks = result.Clicks
                }
            });
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(500, new { message = "Server configuration error", detail = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Daily report failed");
            return StatusCode(500, new { message = "Failed to send daily report", detail = ex.Message });
        }
    }
}
