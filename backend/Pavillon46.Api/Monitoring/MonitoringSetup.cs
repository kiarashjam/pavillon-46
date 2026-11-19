using System.Text.Json;
using Microsoft.ApplicationInsights.Extensibility;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Logging.ApplicationInsights;
using Pavillon46.Api.Models;
using Pavillon46.Api.Services;

namespace Pavillon46.Api.Monitoring;

/// <summary>
/// Monitoring, wired from <c>Program.cs</c>: the <c>/health</c> checks, the alert
/// signals, and Application Insights when a connection string is set.
/// </summary>
public static class MonitoringSetup
{
    public const string HealthPath = "/health";
    // The old { ok: true } endpoint's path, now answering the same report, for
    // anything that still polls it.
    public const string LegacyHealthPath = "/healthz";

    private static readonly TimeSpan CheckTimeout = TimeSpan.FromSeconds(10);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static bool IsHealthPath(string? path) =>
        string.Equals(path, HealthPath, StringComparison.OrdinalIgnoreCase)
        || string.Equals(path, LegacyHealthPath, StringComparison.OrdinalIgnoreCase);

    public static void AddMonitoring(this WebApplicationBuilder builder)
    {
        var services = builder.Services;
        services.AddSingleton<IMonitoringAlerts, MonitoringAlerts>();
        services.AddSingleton(new SweepHeartbeat(MeetingCrmNotifier.SweepEvery));
        services.AddHealthChecks()
            .AddCheck<StorageHealthCheck>("storage", HealthStatus.Unhealthy, Array.Empty<string>(), CheckTimeout)
            .AddCheck<CadenceSyncHealthCheck>("cadence-sync", HealthStatus.Degraded, Array.Empty<string>(), CheckTimeout)
            .AddCheck<ConfigurationHealthCheck>("configuration", HealthStatus.Degraded);

        // No connection string: the SDK is not registered at all, so nothing is
        // collected and nothing leaves the process. Logging stays as it was.
        var insights = builder.Configuration.GetSection("ApplicationInsights").Get<ApplicationInsightsOptions>()
            ?? new ApplicationInsightsOptions();
        if (!insights.IsConfigured()) return;

        services.AddApplicationInsightsTelemetry(options =>
        {
            options.ConnectionString = insights.ConnectionString.Trim();
            // Replaced below by adaptive sampling that spares exceptions and logs.
            options.EnableAdaptiveSampling = false;
            // The Request-Context response header would hand every caller this
            // resource's app id; nothing here reads it.
            options.RequestCollectionOptions.InjectResponseHeaders = false;
        });
        services.AddSingleton<ITelemetryInitializer, TelemetryRedactionInitializer>();
        services.AddApplicationInsightsTelemetryProcessor<HealthProbeTelemetryFilter>();
        services.Configure<TelemetryConfiguration>(config =>
        {
            // Requests and dependencies are sampled; exceptions and traces never
            // are, so no monitoring.* line can be dropped. Traces stay few
            // because only Warning and up are sent (below).
            var chain = config.DefaultTelemetrySink.TelemetryProcessorChainBuilder;
            chain.UseAdaptiveSampling(maxTelemetryItemsPerSecond: 5, excludedTypes: "Exception;Trace");
            chain.Build();
        });

        // The app logs through ILogger only; the SDK adds a logger provider that
        // sends Warning and up (Logging:ApplicationInsights:LogLevel can change
        // that). Kept out of it: the admin seed, whose Development-only line
        // carries a generated password, and the health checks' own log of
        // every Degraded probe, once a minute.
        builder.Logging.AddFilter<ApplicationInsightsLoggerProvider>("AdminSeed", LogLevel.None);
        builder.Logging.AddFilter<ApplicationInsightsLoggerProvider>("Microsoft.Extensions.Diagnostics.HealthChecks", LogLevel.Error);
    }

    /// <summary>
    /// <c>GET /health</c>: <c>{ status, totalDurationMs, checks: [{ name, status,
    /// description, durationMs, data }] }</c>, 200 when Healthy or Degraded, 503 when
    /// Unhealthy. Anonymous.
    /// </summary>
    public static void MapHealth(this WebApplication app)
    {
        var options = new HealthCheckOptions
        {
            ResponseWriter = WriteHealthAsync,
            ResultStatusCodes =
            {
                [HealthStatus.Healthy] = StatusCodes.Status200OK,
                [HealthStatus.Degraded] = StatusCodes.Status200OK,
                [HealthStatus.Unhealthy] = StatusCodes.Status503ServiceUnavailable,
            },
        };
        app.MapHealthChecks(HealthPath, options);
        app.MapHealthChecks(LegacyHealthPath, options);
    }

    private static Task WriteHealthAsync(HttpContext context, HealthReport report)
    {
        context.Response.ContentType = "application/json; charset=utf-8";
        var body = new
        {
            status = report.Status.ToString(),
            totalDurationMs = Math.Round(report.TotalDuration.TotalMilliseconds, 1),
            checks = report.Entries.Select(entry => new
            {
                name = entry.Key,
                status = entry.Value.Status.ToString(),
                // A check that threw: its type only, since an exception's message
                // can carry anything. A timeout keeps its own description.
                description = entry.Value.Exception is { } ex and not OperationCanceledException
                    ? $"The check failed ({ex.GetType().Name})."
                    : entry.Value.Description,
                durationMs = Math.Round(entry.Value.Duration.TotalMilliseconds, 1),
                data = entry.Value.Data,
            }),
        };
        return JsonSerializer.SerializeAsync(context.Response.Body, body, Json);
    }
}
