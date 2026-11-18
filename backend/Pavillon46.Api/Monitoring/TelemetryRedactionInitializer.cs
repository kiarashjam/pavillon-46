using Microsoft.ApplicationInsights.Channel;
using Microsoft.ApplicationInsights.DataContracts;
using Microsoft.ApplicationInsights.Extensibility;

namespace Pavillon46.Api.Monitoring;

/// <summary>
/// Runs on every telemetry item before it is sampled or sent: names the cloud
/// role, and takes tokens and personal data out of URLs, operation names,
/// messages and properties (<see cref="Redaction"/>).
/// </summary>
/// <remarks>
/// Request bodies are never collected by the SDK. What this guards is what it
/// does collect: request and dependency URLs (an unsubscribe or invitation token
/// in the query, a SAS signature on a storage call), and log lines, several of
/// which still carry a raw email address (root AGENTS.md, open work) or a
/// provider's error body. The client IP is zeroed too, as Azure Monitor does
/// by default, so nothing depends on that workspace setting.
/// </remarks>
public sealed class TelemetryRedactionInitializer : ITelemetryInitializer
{
    public const string CloudRoleName = "pavillon46-api";

    // Property names whose value is dropped whole, whatever it looks like.
    // Matched as a substring, case-insensitive; plus any name ending in "token"
    // (but not TokenPrefix, the first characters of a token's hash).
    private static readonly string[] SecretKeys =
    {
        "password", "secret", "authorization", "cookie", "apikey", "api_key", "signature",
    };

    public void Initialize(ITelemetry telemetry)
    {
        try
        {
            telemetry.Context.Cloud.RoleName = CloudRoleName;
            telemetry.Context.Location.Ip = "0.0.0.0";
            if (!string.IsNullOrEmpty(telemetry.Context.Operation.Name))
                telemetry.Context.Operation.Name = Redaction.Name(telemetry.Context.Operation.Name);

            switch (telemetry)
            {
                case RequestTelemetry request:
                    request.Url = Redaction.Url(request.Url);
                    request.Name = Redaction.Name(request.Name);
                    break;
                case DependencyTelemetry dependency:
                    dependency.Data = Redaction.Text(dependency.Data);
                    dependency.Name = Redaction.Name(dependency.Name);
                    break;
                case TraceTelemetry trace:
                    trace.Message = Redaction.Text(trace.Message);
                    break;
                case ExceptionTelemetry exception:
                    foreach (var detail in exception.ExceptionDetailsInfoList)
                        detail.Message = Redaction.Text(detail.Message);
                    break;
            }

            if (telemetry is ISupportProperties withProperties) ScrubProperties(withProperties.Properties);
        }
        catch
        {
            // Never let redaction break the request or the logger. An item that
            // failed half-way is still better redacted than not.
        }
    }

    private static void ScrubProperties(IDictionary<string, string> properties)
    {
        foreach (var key in properties.Keys.ToList())
        {
            var value = properties[key];
            if (string.IsNullOrEmpty(value)) continue;
            var secret = key.EndsWith("token", StringComparison.OrdinalIgnoreCase)
                || SecretKeys.Any(k => key.Contains(k, StringComparison.OrdinalIgnoreCase));
            // RequestPath and the like: a path, redacted as one.
            properties[key] = secret ? Redaction.Redacted
                : value.StartsWith('/') ? Redaction.Name(value)
                : Redaction.Text(value);
        }
    }
}

/// <summary>
/// Drops successful requests to <c>/health</c>: App Service's health check calls it
/// every minute on every instance, which would otherwise be most of this
/// site's request telemetry. A failing one (503) is kept.
/// </summary>
public sealed class HealthProbeTelemetryFilter : ITelemetryProcessor
{
    private readonly ITelemetryProcessor _next;

    public HealthProbeTelemetryFilter(ITelemetryProcessor next) => _next = next;

    public void Process(ITelemetry item)
    {
        if (item is RequestTelemetry { Success: true, Url.IsAbsoluteUri: true } request
            && MonitoringSetup.IsHealthPath(request.Url.AbsolutePath)) return;
        _next.Process(item);
    }
}
