using System.Net.Http.Json;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public class LeadsWebhookService : ILeadsWebhookService
{
    private readonly HttpClient _http;
    private readonly LeadsWebhookOptions _opts;
    private readonly ILogger<LeadsWebhookService> _logger;

    public LeadsWebhookService(HttpClient http, IOptions<LeadsWebhookOptions> opts, ILogger<LeadsWebhookService> logger)
    {
        _http = http;
        _opts = opts.Value;
        _logger = logger;
    }

    public async Task<WebhookResult> PostLeadAsync(LeadPayload lead, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_opts.Url) ||
            !Uri.TryCreate(_opts.Url, UriKind.Absolute, out var uri) ||
            (uri.Scheme != "http" && uri.Scheme != "https"))
        {
            return new WebhookResult
            {
                Ok = false,
                Skipped = true,
                Attempted = false,
                Reason = "invalid_or_missing_webhook_url",
                Summary = "Lead webhook was not called because the webhook URL is missing or invalid."
            };
        }

        if (string.IsNullOrWhiteSpace(_opts.ApiKey))
        {
            return new WebhookResult
            {
                Ok = false,
                Skipped = true,
                Attempted = false,
                Reason = "missing_leads_webhook_api_key",
                Summary = "Lead webhook was not called because LEADS_WEBHOOK_API_KEY is not set."
            };
        }

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromMilliseconds(_opts.TimeoutMs));

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, uri)
            {
                Content = JsonContent.Create(lead)
            };
            request.Headers.Add("X-Api-Key", _opts.ApiKey);

            using var response = await _http.SendAsync(request, cts.Token);
            var status = (int)response.StatusCode;
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cts.Token);
                _logger.LogError("Lead webhook HTTP error: {Status} {Body}", status, body.Length > 800 ? body[..800] : body);
                return new WebhookResult
                {
                    Ok = false,
                    Attempted = true,
                    HttpStatus = status,
                    DestinationHost = uri.Host,
                    Error = $"upstream_http_{status}",
                    Summary = "Lead webhook call failed after emails were sent; check server logs."
                };
            }

            return new WebhookResult
            {
                Ok = true,
                Attempted = true,
                HttpStatus = status,
                DestinationHost = uri.Host,
                Summary = "Lead payload was posted to the CRM webhook successfully."
            };
        }
        catch (TaskCanceledException) when (cts.IsCancellationRequested && !ct.IsCancellationRequested)
        {
            _logger.LogError("Lead webhook timed out");
            return new WebhookResult
            {
                Ok = false,
                Attempted = true,
                DestinationHost = uri.Host,
                Error = "request_timeout",
                Summary = "Lead webhook timed out after emails were sent."
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lead webhook error");
            return new WebhookResult
            {
                Ok = false,
                Attempted = true,
                DestinationHost = uri.Host,
                Error = ex.Message,
                Summary = "Lead webhook call failed after emails were sent; check server logs."
            };
        }
    }
}
