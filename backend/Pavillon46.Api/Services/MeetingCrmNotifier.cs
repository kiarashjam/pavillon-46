using System.Collections.Concurrent;
using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Threading.Channels;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface IMeetingCrmNotifier
{
    /// <summary>
    /// Queues telling the CRM about a booking, in the background, with a few
    /// retries. From an invitation: posts the booking (or its cancellation) to
    /// the CRM that sent it. Otherwise, a new booking goes to the CRM as a lead
    /// through the leads webhook. Never blocks the caller and never throws;
    /// false when there is nothing to send or the queue is full.
    /// </summary>
    bool Enqueue(MeetingBooking booking);
}

/// <summary>
/// Tells the CadenceE CRM about bookings, after they are saved, so the meeting
/// shows on the lead. Same queue-with-retry shape as <see cref="CadenceReporter"/>.
/// </summary>
/// <remarks>
/// <para>
/// A booking from an invitation is posted to <c>{u}/api/public/meetings</c>, where
/// <c>u</c> is the CRM base URL the signed invitation carried, signed the way the
/// CRM signs its handoffs to this site: <c>X-Cadence-Timestamp</c> (Unix seconds)
/// and <c>X-Cadence-Signature-256: sha256=hex(HMAC-SHA256(secret, "{timestamp}.{body}"))</c>,
/// re-signed on every attempt so a retry is never stale.
/// </para>
/// <para>
/// Posts for one booking go in order (booked before cancelled), even across
/// retries. Log lines name the host and the booking id, never a person.
/// </para>
/// </remarks>
public sealed class MeetingCrmNotifier : BackgroundService, IMeetingCrmNotifier
{
    public const string LeadSource = "Rendez-vous pavillon46.ch";
    public const string HttpClientName = "cadence-meetings";

    private static readonly TimeSpan[] RetryDelays =
    {
        TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(10), TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(5),
    };

    // The CRM verifies the signature over the bytes as sent, so these settle
    // what those bytes are: camelCase, accents written as themselves.
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private sealed record Item(MeetingBooking Booking, Uri? CrmUrl);

    private readonly Channel<Item> _queue = Channel.CreateBounded<Item>(
        new BoundedChannelOptions(500) { FullMode = BoundedChannelFullMode.DropWrite });
    private readonly SemaphoreSlim _inFlight = new(4, 4);
    // The last delivery queued per booking, which the next one waits for.
    private readonly ConcurrentDictionary<string, Task> _lastByBooking = new();

    private readonly IHttpClientFactory _http;
    private readonly IServiceScopeFactory _scopes;
    private readonly CadenceOptions _cadence;
    private readonly IHostEnvironment _environment;
    private readonly ILogger<MeetingCrmNotifier> _logger;

    public MeetingCrmNotifier(
        IHttpClientFactory http,
        IServiceScopeFactory scopes,
        IOptions<CadenceOptions> cadence,
        IHostEnvironment environment,
        ILogger<MeetingCrmNotifier> logger)
    {
        _http = http;
        _scopes = scopes;
        _cadence = cadence.Value;
        _environment = environment;
        _logger = logger;
    }

    /// <summary>https, or plain http in Development (a CRM on a developer's machine).</summary>
    private Uri? MeetingsEndpoint(string? baseUrl)
    {
        if (string.IsNullOrWhiteSpace(baseUrl) || !Uri.TryCreate(baseUrl.Trim(), UriKind.Absolute, out var uri)) return null;
        if (uri.Scheme != Uri.UriSchemeHttps && !(uri.Scheme == Uri.UriSchemeHttp && _environment.IsDevelopment())) return null;
        if (!string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment) || !string.IsNullOrEmpty(uri.UserInfo)) return null;
        return new Uri(uri.GetLeftPart(UriPartial.Path).TrimEnd('/') + "/api/public/meetings");
    }

    public bool Enqueue(MeetingBooking booking)
    {
        Uri? url = null;
        if (booking.FromInvitation())
        {
            url = MeetingsEndpoint(booking.CrmBaseUrl);
            if (url is null)
            {
                _logger.LogWarning("meetings.crm.no_valid_url booking={Booking}", booking.Id);
                return false;
            }
        }
        // A direct booking reaches the CRM as a lead once; its cancellation has
        // no lead-webhook equivalent.
        else if (!booking.IsBooked())
        {
            return false;
        }

        var item = new Item(Snapshot(booking), url);
        if (_queue.Writer.TryWrite(item)) return true;
        _logger.LogWarning("meetings.crm.queue_full booking={Booking}", booking.Id);
        return false;
    }

    private static MeetingBooking Snapshot(MeetingBooking b) =>
        JsonSerializer.Deserialize<MeetingBooking>(JsonSerializer.Serialize(b))!;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var item in _queue.Reader.ReadAllAsync(stoppingToken))
            {
                await _inFlight.WaitAsync(stoppingToken);
                var id = item.Booking.Id;
                var previous = _lastByBooking.TryGetValue(id, out var p) ? p : Task.CompletedTask;
                var done = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                _lastByBooking[id] = done.Task;
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await previous;
                        await DeliverAsync(item, stoppingToken);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning("meetings.crm.failed booking={Booking} error={Error}", id, ex.GetType().Name);
                    }
                    finally
                    {
                        _inFlight.Release();
                        // Forget this booking's chain unless something newer waits on it.
                        _lastByBooking.TryRemove(new KeyValuePair<string, Task>(id, done.Task));
                        done.TrySetResult();
                    }
                }, CancellationToken.None);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutting down.
        }
    }

    private enum Outcome { Done, Retry, GiveUp }

    private async Task DeliverAsync(Item item, CancellationToken ct)
    {
        var what = item.CrmUrl is null ? "lead" : item.Booking.Status;
        var where = item.CrmUrl?.Host ?? "leads-webhook";
        for (var attempt = 0; ; attempt++)
        {
            var outcome = item.CrmUrl is null
                ? await PostLeadAsync(item.Booking, ct)
                : await PostMeetingAsync(item.CrmUrl, item.Booking, ct);
            if (outcome == Outcome.Done) return;
            if (outcome == Outcome.GiveUp || attempt >= RetryDelays.Length)
            {
                _logger.LogWarning("meetings.crm.dropped host={Host} booking={Booking} event={Event} attempts={Attempts}",
                    where, item.Booking.Id, what, attempt + 1);
                return;
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

    /// <summary>The exact body posted to the CRM for a booking from an invitation.</summary>
    internal static byte[] MeetingBody(MeetingBooking b) => JsonSerializer.SerializeToUtf8Bytes(new
    {
        organizationId = b.CrmOrganizationId,
        leadId = b.CrmLeadId,
        code = b.Code,
        bookingId = b.Id,
        firstName = b.FirstName,
        lastName = b.LastName,
        email = b.Email,
        phone = b.Phone,
        message = b.Message,
        startsAt = MeetingCalendar.StartsAt(b.Date, b.Time),
        durationMinutes = b.DurationMinutes,
        language = b.Language,
        status = b.IsBooked() ? "booked" : "cancelled",
    }, Json);

    /// <summary>"sha256=" + lowercase hex HMAC-SHA256(secret, "{timestamp}.{body}").</summary>
    internal static string Sign(string secret, string timestamp, byte[] body)
    {
        var prefix = Encoding.UTF8.GetBytes(timestamp + ".");
        var signed = new byte[prefix.Length + body.Length];
        Buffer.BlockCopy(prefix, 0, signed, 0, prefix.Length);
        Buffer.BlockCopy(body, 0, signed, prefix.Length, body.Length);
        return "sha256=" + Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret.Trim()), signed)).ToLowerInvariant();
    }

    private async Task<Outcome> PostMeetingAsync(Uri url, MeetingBooking booking, CancellationToken ct)
    {
        // The secret may have been removed since the booking: nothing can be signed.
        if (!_cadence.IsConfigured())
        {
            _logger.LogWarning("meetings.crm.not_configured booking={Booking}", booking.Id);
            return Outcome.GiveUp;
        }
        try
        {
            var body = MeetingBody(booking);
            var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture);
            using var client = _http.CreateClient(HttpClientName);
            using var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = new ByteArrayContent(body) };
            request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json") { CharSet = "utf-8" };
            request.Headers.Add("X-Cadence-Timestamp", timestamp);
            request.Headers.Add("X-Cadence-Signature-256", Sign(_cadence.OnboardingSecret, timestamp, body));
            using var response = await client.SendAsync(request, ct);
            var status = (int)response.StatusCode;
            if (status is >= 200 and < 300)
            {
                _logger.LogInformation("meetings.crm.sent host={Host} booking={Booking} event={Event}", url.Host, booking.Id, booking.Status);
                return Outcome.Done;
            }
            _logger.LogWarning("meetings.crm.refused host={Host} booking={Booking} event={Event} status={Status}", url.Host, booking.Id, booking.Status, status);
            // 401: the secrets differ; 400/404: it will never take this post.
            return status is 408 or 429 or >= 500 ? Outcome.Retry : Outcome.GiveUp;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            return Outcome.GiveUp;
        }
        catch (Exception ex)
        {
            _logger.LogWarning("meetings.crm.unreachable host={Host} booking={Booking} error={Error}", url.Host, booking.Id, ex.GetType().Name);
            return Outcome.Retry;
        }
    }

    private async Task<Outcome> PostLeadAsync(MeetingBooking booking, CancellationToken ct)
    {
        try
        {
            // The leads webhook is a typed HttpClient (transient): one per attempt.
            using var scope = _scopes.CreateScope();
            var webhook = scope.ServiceProvider.GetRequiredService<ILeadsWebhookService>();
            var result = await webhook.PostLeadAsync(new LeadPayload(
                Name: $"{booking.FirstName} {booking.LastName}".Trim(),
                Email: booking.Email,
                Phone: booking.Phone,
                CompanyName: "",
                Source: LeadSource), ct);
            if (result.Ok)
            {
                _logger.LogInformation("meetings.lead.sent host={Host} booking={Booking}", result.DestinationHost, booking.Id);
                return Outcome.Done;
            }
            if (result.Skipped)
            {
                _logger.LogInformation("meetings.lead.skipped booking={Booking} reason={Reason}", booking.Id, result.Reason);
                return Outcome.GiveUp;
            }
            return result.HttpStatus is null or 408 or 429 or >= 500 ? Outcome.Retry : Outcome.GiveUp;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            return Outcome.GiveUp;
        }
        catch (Exception ex)
        {
            _logger.LogWarning("meetings.lead.failed booking={Booking} error={Error}", booking.Id, ex.GetType().Name);
            return Outcome.Retry;
        }
    }
}
