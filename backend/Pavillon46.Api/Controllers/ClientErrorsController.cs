using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Pavillon46.Api.Monitoring;
using Pavillon46.Api.Privacy;
using Pavillon46.Api.Services;

namespace Pavillon46.Api.Controllers;

/// <summary>
/// Where the site's error reporter (<c>frontend/src/lib/errorReporter.ts</c>) sends
/// uncaught browser errors, so they reach the logs and Application Insights as
/// <c>monitoring.browser.error</c> warnings. Anonymous, so everything in a report is
/// treated as hostile: size-capped, rate-limited, and stripped of tokens and
/// personal data before it is logged.
/// </summary>
[ApiController]
[Route("api/client-errors")]
public class ClientErrorsController : ControllerBase
{
    public const int MaxBodyBytes = 16 * 1024;
    private const int PerIpMax = 30;
    private const int PerIpWindowMs = 60_000;
    // All visitors together: a flood from many addresses still logs a bounded amount.
    private const int GlobalMax = 600;

    // Field caps, in characters. The reporter applies the same ones.
    private const int MaxMessage = 500;
    private const int MaxStack = 4000;
    private const int MaxUrl = 500;
    private const int MaxComponentStack = 4000;
    private const int MaxUserAgent = 300;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly KeyedRateLimiter _rateLimiter;
    private readonly ILogger<ClientErrorsController> _logger;

    public ClientErrorsController(KeyedRateLimiter rateLimiter, ILogger<ClientErrorsController> logger)
    {
        _rateLimiter = rateLimiter;
        _logger = logger;
    }

    public sealed record ClientErrorReport(string? Message, string? Stack, string? Url, string? ComponentStack, string? UserAgent);

    /// <summary>
    /// <c>{ message, stack?, url?, componentStack?, userAgent? }</c> → <c>204</c>. <c>400</c>
    /// without a message or with a body that is not that JSON, <c>413</c> over 16 KB,
    /// <c>429</c> past 30 a minute from one address.
    /// </summary>
    [HttpPost]
    [RequestSizeLimit(MaxBodyBytes)]
    public async Task<IActionResult> Report(CancellationToken ct)
    {
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        if (_rateLimiter.IsRateLimited("client-errors:ip", ip, PerIpMax, PerIpWindowMs)
            || _rateLimiter.IsRateLimited("client-errors:all", "all", GlobalMax, PerIpWindowMs))
        {
            return StatusCode(429, new { message = "Too many requests. Please try again later." });
        }

        if (Request.ContentLength > MaxBodyBytes) return TooLarge();
        byte[] body;
        try
        {
            using var buffer = new MemoryStream();
            await Request.Body.CopyToAsync(buffer, ct);
            body = buffer.ToArray();
        }
        catch (BadHttpRequestException ex) when (ex.StatusCode == StatusCodes.Status413PayloadTooLarge)
        {
            return TooLarge();
        }

        ClientErrorReport? report;
        try
        {
            report = JsonSerializer.Deserialize<ClientErrorReport>(body, Json);
        }
        catch (JsonException)
        {
            report = null;
        }
        var message = Redaction.Cap(Redaction.Text(Redaction.Cap(report?.Message, MaxMessage * 2)), MaxMessage);
        if (message.Length == 0)
        {
            return BadRequest(new { message = "A JSON body with a message is required.", errorType = "invalid_body" });
        }

        // The page address without its query or fragment: the reset, welcome and
        // invitation links carry their tokens there.
        var url = Redaction.Cap(Redaction.Url(Redaction.Cap(report!.Url, MaxUrl * 2), keepQuery: false), MaxUrl);
        var stack = Redaction.Cap(Redaction.Text(Redaction.Cap(report.Stack, MaxStack * 2)), MaxStack);
        var componentStack = Redaction.Cap(Redaction.Text(Redaction.Cap(report.ComponentStack, MaxComponentStack * 2)), MaxComponentStack);
        var userAgent = PrivacyHelpers.PublicUserAgent(Redaction.Cap(report.UserAgent, MaxUserAgent));

        // The rest goes in a scope: Application Insights stores each as a custom
        // dimension of the same trace; the console shows the message alone.
        using (_logger.BeginScope(new Dictionary<string, object>
        {
            ["Stack"] = stack,
            ["ComponentStack"] = componentStack,
            ["UserAgent"] = userAgent,
        }))
        {
            _logger.LogWarning("monitoring.browser.error {Message} at {Url}", message, url);
        }
        return NoContent();
    }

    private ObjectResult TooLarge() =>
        StatusCode(StatusCodes.Status413PayloadTooLarge, new { message = "The report is too large.", errorType = "too_large" });
}
