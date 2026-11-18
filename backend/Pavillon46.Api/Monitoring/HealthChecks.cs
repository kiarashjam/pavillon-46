using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;
using Pavillon46.Api.Services;

namespace Pavillon46.Api.Monitoring;

// The checks behind /health. The endpoint is anonymous: descriptions and data
// carry names, counts and durations only — never a value of a setting, a
// connection string, an exception message or anything about a person.

/// <summary>Members can be read from the store the API is using (Azure Table, JSONL file or memory).</summary>
public sealed class StorageHealthCheck : IHealthCheck
{
    private readonly IMemberStore _members;
    private readonly IHostEnvironment _environment;

    public StorageHealthCheck(IMemberStore members, IHostEnvironment environment)
    {
        _members = members;
        _environment = environment;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken ct = default)
    {
        string backend;
        try
        {
            // WaitAsync: the first call also creates the table, without a token.
            backend = await _members.ProbeAsync(ct).WaitAsync(ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            var status = ex is Azure.RequestFailedException { Status: > 0 } failed ? $", HTTP {failed.Status}" : "";
            return HealthCheckResult.Unhealthy($"Members could not be read ({ex.GetType().Name}{status}).");
        }

        var data = new Dictionary<string, object> { ["backend"] = backend };
        return backend switch
        {
            "azure-table" => HealthCheckResult.Healthy("Members read from Azure Table storage.", data),
            "file" => HealthCheckResult.Healthy("Members read from the local JSONL file (no Azure connection string).", data),
            _ when _environment.IsDevelopment() => HealthCheckResult.Healthy("Members kept in memory (Development).", data),
            _ => HealthCheckResult.Degraded("Members kept in memory only: everything is lost on restart.", data: data),
        };
    }
}

/// <summary>
/// The meetings CRM sweep (<see cref="MeetingCrmNotifier"/>) is still running,
/// and every booking reached CadenceE. Unhealthy only when the sweep stopped:
/// bookings waiting on the CRM are Degraded, since the site itself still works.
/// </summary>
public sealed class CadenceSyncHealthCheck : IHealthCheck
{
    public static readonly TimeSpan UnsyncedAfter = TimeSpan.FromHours(1);

    private readonly SweepHeartbeat _heartbeat;
    private readonly IMeetingCrmNotifier _notifier;

    public CadenceSyncHealthCheck(SweepHeartbeat heartbeat, IMeetingCrmNotifier notifier)
    {
        _heartbeat = heartbeat;
        _notifier = notifier;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;
        var lastSweep = _heartbeat.LastBeatAt;
        var data = new Dictionary<string, object>
        {
            ["sweepIntervalSeconds"] = (int)_heartbeat.Interval.TotalSeconds,
        };
        if (lastSweep is { } at)
        {
            data["lastSweepAt"] = at.ToString("o");
            data["lastSweepAgeSeconds"] = (int)(now - at).TotalSeconds;
            data["lastSweepOk"] = _heartbeat.LastOk;
        }

        MeetingCrmBacklog? backlog = null;
        string? readError = null;
        try
        {
            backlog = await _notifier.BacklogAsync(UnsyncedAfter, ct).WaitAsync(ct);
            data["unsyncedOver1h"] = backlog.Unsynced;
            data["halted"] = backlog.Halted;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            readError = ex.GetType().Name;
        }

        if (_heartbeat.IsStalled(now))
        {
            var since = lastSweep is { } last ? $"since {last:u}" : "since startup";
            return HealthCheckResult.Unhealthy(
                $"The CRM sync sweep has not run {since}; it runs every {_heartbeat.Interval.TotalMinutes:0} minutes.", data: data);
        }
        if (readError is not null)
        {
            return HealthCheckResult.Degraded($"Bookings could not be read ({readError}).", data: data);
        }
        if (backlog!.Unsynced > 0)
        {
            var halted = backlog.Halted > 0 ? $"; {backlog.Halted} refused, waiting for an admin's \"Send again\"" : "";
            return HealthCheckResult.Degraded(
                $"{backlog.Unsynced} booking(s) not in CadenceE after an hour{halted}.", data: data);
        }
        return HealthCheckResult.Healthy(
            lastSweep is null ? "The sweep starts shortly after startup." : "The sweep is running; every booking is in CadenceE.", data);
    }
}

/// <summary>
/// The settings whose absence silently stopped the welcome emails before.
/// Names only, never values.
/// </summary>
/// <remarks>
/// Only list a setting whose absence is safe to announce. A missing one here
/// switches a feature off (secrets fail closed); never add one whose absence
/// would help an attacker, such as AUTH_TOKEN_SECRET still at its default.
/// </remarks>
public sealed class ConfigurationHealthCheck : IHealthCheck
{
    private readonly CadenceOptions _cadence;
    private readonly SendGridOptions _sendGrid;
    private readonly LeadsWebhookOptions _leads;

    public ConfigurationHealthCheck(
        IOptions<CadenceOptions> cadence, IOptions<SendGridOptions> sendGrid, IOptions<LeadsWebhookOptions> leads)
    {
        _cadence = cadence.Value;
        _sendGrid = sendGrid.Value;
        _leads = leads.Value;
    }

    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken ct = default)
    {
        var missing = new List<string>();
        // Shorter than its minimum counts as missing: the integration is off.
        if (!_cadence.IsConfigured()) missing.Add("CADENCE_ONBOARDING_SECRET");
        if (string.IsNullOrEmpty(_sendGrid.ResolvedApiKey())) missing.Add("SENDGRID_API_KEY");
        if (string.IsNullOrEmpty(_sendGrid.ResolvedFromEmail())) missing.Add("FROM_EMAIL");
        if (string.IsNullOrWhiteSpace(_leads.ApiKey)) missing.Add("LEADS_WEBHOOK_API_KEY");

        var data = new Dictionary<string, object> { ["missing"] = missing };
        return Task.FromResult(missing.Count == 0
            ? HealthCheckResult.Healthy("Every setting checked is set.", data)
            : HealthCheckResult.Degraded($"Not set: {string.Join(", ", missing)}.", data: data));
    }
}
