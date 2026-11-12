using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;

namespace Pavillon46.Api.Services;

/// <summary>One step of a handoff, reported back to the CadenceE CRM.</summary>
public sealed record CadenceReport(string Event, string AccountId, string? Message, DateTime OccurredAtUtc);

public interface ICadenceReporter
{
    /// <summary>Whether reports may be posted to this address (https; plain http in Development only).</summary>
    bool IsAllowedCallback(string? url);

    /// <summary>
    /// Queues reports for one handoff, posted in this order, in the background,
    /// with a few retries. Never blocks the caller; false when the address is
    /// not allowed or the queue is full.
    /// </summary>
    bool Enqueue(string callbackUrl, string callbackToken, IReadOnlyList<CadenceReport> reports);
}

/// <summary>
/// Posts handoff progress back to the CRM's callback address, after the
/// handoff has been answered. Reports for one handoff go in order (the account,
/// then the email), so the CRM's timeline reads the way things happened.
/// </summary>
/// <remarks>
/// The callback token authorises reports on that one handoff. It travels only in
/// the Authorization header and is never logged; log lines name the host alone.
/// A report that cannot be delivered is dropped after the last retry: the CRM
/// still shows the handoff as delivered, and its team can resend it.
/// </remarks>
public sealed class CadenceReporter : BackgroundService, ICadenceReporter
{
    private static readonly TimeSpan[] RetryDelays =
    {
        TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(10), TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(5),
    };

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private sealed record Batch(Uri Url, string Token, IReadOnlyList<CadenceReport> Reports);

    // Bounded: a burst beyond this is dropped (and logged) rather than holding
    // memory without limit. Handoffs are one per won deal.
    private readonly Channel<Batch> _queue = Channel.CreateBounded<Batch>(
        new BoundedChannelOptions(500) { FullMode = BoundedChannelFullMode.DropWrite });
    private readonly SemaphoreSlim _inFlight = new(4, 4);
    private readonly IHttpClientFactory _http;
    private readonly IHostEnvironment _environment;
    private readonly ILogger<CadenceReporter> _logger;

    public CadenceReporter(IHttpClientFactory http, IHostEnvironment environment, ILogger<CadenceReporter> logger)
    {
        _http = http;
        _environment = environment;
        _logger = logger;
    }

    public bool IsAllowedCallback(string? url)
    {
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri)) return false;
        if (uri.Scheme == Uri.UriSchemeHttps) return true;
        // A CRM running on a developer's machine has no certificate.
        return uri.Scheme == Uri.UriSchemeHttp && _environment.IsDevelopment();
    }

    public bool Enqueue(string callbackUrl, string callbackToken, IReadOnlyList<CadenceReport> reports)
    {
        if (reports.Count == 0 || string.IsNullOrWhiteSpace(callbackToken) || !IsAllowedCallback(callbackUrl)) return false;
        var batch = new Batch(new Uri(callbackUrl.Trim()), callbackToken.Trim(), reports);
        if (_queue.Writer.TryWrite(batch)) return true;
        _logger.LogWarning("cadence.report.queue_full host={Host} events={Events}", batch.Url.Host, string.Join(",", reports.Select(r => r.Event)));
        return false;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var batch in _queue.Reader.ReadAllAsync(stoppingToken))
            {
                await _inFlight.WaitAsync(stoppingToken);
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await DeliverAsync(batch, stoppingToken);
                    }
                    finally
                    {
                        _inFlight.Release();
                    }
                }, CancellationToken.None);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutting down.
        }
    }

    private async Task DeliverAsync(Batch batch, CancellationToken ct)
    {
        foreach (var report in batch.Reports)
        {
            for (var attempt = 0; ; attempt++)
            {
                var outcome = await PostAsync(batch, report, ct);
                if (outcome == Outcome.Done) break;
                if (outcome == Outcome.GiveUp || attempt >= RetryDelays.Length)
                {
                    _logger.LogWarning("cadence.report.dropped host={Host} event={Event} attempts={Attempts}",
                        batch.Url.Host, report.Event, attempt + 1);
                    // Later reports in the batch describe what followed this
                    // one; they are still worth sending.
                    break;
                }
                try
                {
                    await Task.Delay(RetryDelays[attempt], ct);
                }
                catch (OperationCanceledException)
                {
                    return;
                }
            }
        }
    }

    private enum Outcome { Done, Retry, GiveUp }

    private async Task<Outcome> PostAsync(Batch batch, CadenceReport report, CancellationToken ct)
    {
        try
        {
            using var client = _http.CreateClient("cadence-reports");
            using var request = new HttpRequestMessage(HttpMethod.Post, batch.Url)
            {
                Content = new StringContent(JsonSerializer.Serialize(new
                {
                    @event = report.Event,
                    accountId = report.AccountId,
                    message = report.Message,
                    occurredAtUtc = report.OccurredAtUtc,
                }, Json), Encoding.UTF8, "application/json"),
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", batch.Token);
            using var response = await client.SendAsync(request, ct);
            var status = (int)response.StatusCode;
            if (status is >= 200 and < 300)
            {
                _logger.LogInformation("cadence.report.sent host={Host} event={Event}", batch.Url.Host, report.Event);
                return Outcome.Done;
            }
            _logger.LogWarning("cadence.report.refused host={Host} event={Event} status={Status}", batch.Url.Host, report.Event, status);
            // 401 means the CRM no longer knows this token (its secret was
            // changed); 400 that it will never take this report. Retrying
            // either would only repeat the refusal.
            return status is 408 or 429 or >= 500 ? Outcome.Retry : Outcome.GiveUp;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            return Outcome.GiveUp;
        }
        catch (Exception ex)
        {
            _logger.LogWarning("cadence.report.unreachable host={Host} event={Event} error={Error}", batch.Url.Host, report.Event, ex.GetType().Name);
            return Outcome.Retry;
        }
    }
}
