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
    /// Queues bringing CadenceE up to date with a booking (just booked, or just
    /// cancelled). Returns at once and never throws; what cannot be sent now is
    /// resent later by the sweep, since the sync state lives on the booking.
    /// </summary>
    void Enqueue(string bookingId);

    /// <summary>
    /// The admin's "Send again": one attempt now, even after a refusal. Returns
    /// the booking with its new sync state; null when there is no such booking.
    /// </summary>
    Task<MeetingBooking?> SyncNowAsync(string bookingId, CancellationToken ct = default);

    /// <summary>Where this booking goes in CadenceE, and whether it is there.</summary>
    MeetingCrmState Describe(MeetingBooking booking);
}

/// <summary>
/// Tells the CadenceE CRM about bookings so the meeting shows on the lead.
/// Same queue-with-retry shape as <see cref="CadenceReporter"/>, plus a record of
/// what the CRM has acknowledged on each booking (<c>CrmSyncedStatus</c>), so a
/// restart or a long CRM outage loses nothing.
/// </summary>
/// <remarks>
/// <para>
/// Where a booking goes: from an invitation, to <c>{u}/api/public/meetings</c>,
/// <c>u</c> being the CRM URL the signed invitation carried. A walk-in, to
/// <c>{CADENCE_CRM_URL}/api/public/meetings</c> under <c>CADENCE_ORGANIZATION_ID</c>
/// with no lead id and no code (the CRM finds the lead by email or creates it);
/// without those two settings, to the leads webhook as a new lead, which has no
/// place for the time or a cancellation. Posts are signed the way the CRM signs
/// its handoffs here — <c>X-Cadence-Timestamp</c> and
/// <c>X-Cadence-Signature-256: sha256=hex(HMAC-SHA256(secret, "{timestamp}.{body}"))</c>
/// — and re-signed on every attempt.
/// </para>
/// <para>
/// Each post carries the booking's current status, so a booking cancelled before
/// the CRM heard of it is simply sent as cancelled. Delivery: up to four quick
/// attempts (now, 2 s, 10 s, 1 min); then the sweep, every few minutes, retries
/// with a backoff of 5 minutes doubling to 6 hours, for bookings changed in the
/// last 7 days. A refusal (4xx other than 408/429: a wrong secret, an unknown
/// workspace, a body the CRM will never take) stops the automatic resends until
/// an admin presses "Send again". Log lines name the host and the booking id,
/// never a person.
/// </para>
/// </remarks>
public sealed class MeetingCrmNotifier : BackgroundService, IMeetingCrmNotifier
{
    public const string LeadSource = "Rendez-vous pavillon46.ch";
    public const string HttpClientName = "cadence-meetings";

    private static readonly TimeSpan[] QuickRetries =
    {
        TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(10), TimeSpan.FromMinutes(1),
    };
    private static readonly TimeSpan SweepEvery = TimeSpan.FromMinutes(3);
    private static readonly TimeSpan FirstSweepAfter = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan ResendFor = TimeSpan.FromDays(7);

    // The CRM verifies the signature over the bytes as sent, so these settle
    // what those bytes are: camelCase, nulls written, accents as themselves.
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private enum Route { None, Invitation, Cadence, LeadsWebhook, Unreachable }
    private enum Outcome { Done, Retry, Refused }

    // Booking ids. Bounded: a burst beyond this is dropped here and picked up by
    // the sweep, which works from the stored state.
    private readonly Channel<string> _queue = Channel.CreateBounded<string>(
        new BoundedChannelOptions(1000) { FullMode = BoundedChannelFullMode.DropWrite });
    private readonly SemaphoreSlim _inFlight = new(4, 4);
    // One attempt at a time per booking, so two never race to record a result.
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new();
    // Bookings with a delivery queued or running, so the sweep does not add more.
    private readonly ConcurrentDictionary<string, int> _active = new();

    private readonly IHttpClientFactory _http;
    private readonly IServiceScopeFactory _scopes;
    private readonly IMeetingStore _store;
    private readonly CadenceOptions _cadence;
    private readonly IHostEnvironment _environment;
    private readonly ILogger<MeetingCrmNotifier> _logger;

    public MeetingCrmNotifier(
        IHttpClientFactory http,
        IServiceScopeFactory scopes,
        IMeetingStore store,
        IOptions<CadenceOptions> cadence,
        IHostEnvironment environment,
        ILogger<MeetingCrmNotifier> logger)
    {
        _http = http;
        _scopes = scopes;
        _store = store;
        _cadence = cadence.Value;
        _environment = environment;
        _logger = logger;
    }

    // ---- routing -------------------------------------------------------------

    /// <summary>{base}/api/public/meetings for an https base (plain http in Development only).</summary>
    private Uri? MeetingsEndpoint(string? baseUrl)
    {
        if (string.IsNullOrWhiteSpace(baseUrl) || !Uri.TryCreate(baseUrl.Trim(), UriKind.Absolute, out var uri)) return null;
        if (uri.Scheme != Uri.UriSchemeHttps && !(uri.Scheme == Uri.UriSchemeHttp && _environment.IsDevelopment())) return null;
        if (!string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment) || !string.IsNullOrEmpty(uri.UserInfo)) return null;
        return new Uri(uri.GetLeftPart(UriPartial.Path).TrimEnd('/') + "/api/public/meetings");
    }

    /// <summary>Walk-ins go to the CRM itself when it is fully configured: workspace, URL and secret.</summary>
    private Uri? WalkInEndpoint() =>
        _cadence.IsConfigured() && !string.IsNullOrWhiteSpace(_cadence.OrganizationId) ? MeetingsEndpoint(_cadence.CrmUrl) : null;

    private (Route Route, Uri? Url) RouteOf(MeetingBooking b)
    {
        if (b.FromInvitation())
        {
            var url = MeetingsEndpoint(b.CrmBaseUrl);
            return url is null ? (Route.Unreachable, null) : (Route.Invitation, url);
        }
        if (WalkInEndpoint() is { } walkIn) return (Route.Cadence, walkIn);
        // The leads webhook knows new leads only: a cancellation has nowhere to go.
        return b.IsBooked() ? (Route.LeadsWebhook, null) : (Route.None, null);
    }

    private bool NeedsSync(MeetingBooking b) =>
        RouteOf(b).Route != Route.None && !string.Equals(b.CrmSyncedStatus, b.Status, StringComparison.OrdinalIgnoreCase);

    public MeetingCrmState Describe(MeetingBooking b)
    {
        var route = RouteOf(b).Route;
        var channel = route switch
        {
            Route.Invitation or Route.Unreachable => "invitation",
            Route.Cadence => "cadence",
            Route.LeadsWebhook => "leads-webhook",
            // Nothing (more) to send. Say how it went in, if it did.
            _ => b.FromInvitation() ? "invitation" : string.IsNullOrEmpty(b.CrmSyncedStatus) ? "none" : "leads-webhook",
        };
        static string? Opt(string s) => string.IsNullOrEmpty(s) ? null : s;
        return new MeetingCrmState(channel, NeedsSync(b), b.CrmHalted, Opt(b.CrmSyncedAt), Opt(b.CrmLastError), Opt(b.CrmNextAttemptAt));
    }

    // ---- queueing ------------------------------------------------------------

    public void Enqueue(string bookingId)
    {
        if (string.IsNullOrWhiteSpace(bookingId)) return;
        _active.AddOrUpdate(bookingId, 1, (_, n) => n + 1);
        if (!_queue.Writer.TryWrite(bookingId))
        {
            Leave(bookingId);
            _logger.LogWarning("meetings.crm.queue_full booking={Booking}", bookingId);
        }
    }

    private void Leave(string bookingId)
    {
        if (_active.AddOrUpdate(bookingId, 0, (_, n) => n - 1) <= 0) _active.TryRemove(new KeyValuePair<string, int>(bookingId, 0));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var sweeper = SweepLoopAsync(stoppingToken);
        try
        {
            await foreach (var id in _queue.Reader.ReadAllAsync(stoppingToken))
            {
                await _inFlight.WaitAsync(stoppingToken);
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await DeliverAsync(id, stoppingToken);
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        _logger.LogWarning("meetings.crm.failed booking={Booking} error={Error}", id, ex.GetType().Name);
                    }
                    finally
                    {
                        _inFlight.Release();
                        Leave(id);
                    }
                }, CancellationToken.None);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutting down.
        }
        await sweeper;
    }

    /// <summary>On startup, then every few minutes: resend what CadenceE does not have yet.</summary>
    private async Task SweepLoopAsync(CancellationToken ct)
    {
        try
        {
            await Task.Delay(FirstSweepAfter, ct);
            while (!ct.IsCancellationRequested)
            {
                try
                {
                    var now = DateTimeOffset.UtcNow;
                    foreach (var b in await _store.ListBookingsAsync(ct))
                    {
                        if (b.CrmHalted || _active.ContainsKey(b.Id) || !NeedsSync(b)) continue;
                        if (LastChange(b) is not { } changed || changed < now - ResendFor) continue;
                        if (DateTimeOffset.TryParse(b.CrmNextAttemptAt, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var next) && next > now) continue;
                        Enqueue(b.Id);
                    }
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.LogWarning("meetings.crm.sweep_failed error={Error}", ex.GetType().Name);
                }
                await Task.Delay(SweepEvery, ct);
            }
        }
        catch (OperationCanceledException)
        {
            // Shutting down.
        }
    }

    private static DateTimeOffset? LastChange(MeetingBooking b)
    {
        DateTimeOffset? Parse(string s) =>
            DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var at) ? at : null;
        var created = Parse(b.CreatedAt);
        var cancelled = Parse(b.CancelledAt);
        return cancelled is { } c && (created is null || c > created) ? c : created;
    }

    // ---- delivery ------------------------------------------------------------

    /// <summary>A round: quick attempts until in sync, refused, or out of quick retries.</summary>
    private async Task DeliverAsync(string id, CancellationToken ct)
    {
        for (var attempt = 0; ; attempt++)
        {
            var (outcome, booking) = await AttemptAsync(id, manual: false, ct);
            if (booking is null || outcome != Outcome.Retry) return;
            if (attempt >= QuickRetries.Length)
            {
                // Out of quick retries: hand over to the sweep, with backoff.
                var updated = await _store.UpdateBookingAsync(id, b =>
                {
                    b.CrmFailedRounds += 1;
                    var wait = TimeSpan.FromMinutes(Math.Min(360, 5 * Math.Pow(2, Math.Min(b.CrmFailedRounds - 1, 10))));
                    b.CrmNextAttemptAt = DateTimeOffset.UtcNow.Add(wait).ToString("o");
                    return true;
                }, ct);
                _logger.LogWarning("meetings.crm.deferred booking={Booking} rounds={Rounds} next={Next}",
                    id, updated?.CrmFailedRounds, updated?.CrmNextAttemptAt);
                return;
            }
            try
            {
                await Task.Delay(QuickRetries[attempt], ct);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    public async Task<MeetingBooking?> SyncNowAsync(string bookingId, CancellationToken ct = default)
    {
        var (outcome, booking) = await AttemptAsync(bookingId, manual: true, ct);
        if (booking is not null && outcome == Outcome.Retry)
        {
            // Unreachable just now: the sweep keeps trying, starting soon.
            booking = await _store.UpdateBookingAsync(bookingId, b =>
            {
                b.CrmNextAttemptAt = DateTimeOffset.UtcNow.AddMinutes(5).ToString("o");
                return true;
            }, ct);
        }
        return booking;
    }

    /// <summary>
    /// One attempt for one booking: reload it, send its current status if the
    /// CRM does not have it yet, record the result on the row.
    /// </summary>
    private async Task<(Outcome Outcome, MeetingBooking? Booking)> AttemptAsync(string id, bool manual, CancellationToken ct)
    {
        var gate = _locks.GetOrAdd(id, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            var booking = await _store.GetBookingAsync(id, ct);
            if (booking is null) return (Outcome.Done, null);
            if (!NeedsSync(booking)) return (Outcome.Done, booking);
            if (booking.CrmHalted && !manual) return (Outcome.Refused, booking);

            // Sent as it is now; recorded against this status, so a cancellation
            // saved meanwhile still reads as not synced and goes next.
            var snapshot = Copy(booking);
            var (route, url) = RouteOf(snapshot);
            var (outcome, error) = route switch
            {
                Route.Invitation or Route.Cadence => await PostMeetingAsync(url!, snapshot, route == Route.Cadence, ct),
                Route.LeadsWebhook => await PostLeadAsync(snapshot, ct),
                _ => (Outcome.Refused, "The invitation's CRM address is not one this site may post to (https only)."),
            };

            var saved = await _store.UpdateBookingAsync(id, b =>
            {
                if (outcome == Outcome.Done)
                {
                    b.CrmSyncedStatus = snapshot.Status;
                    b.CrmSyncedAt = DateTime.UtcNow.ToString("o");
                    b.CrmLastError = "";
                    b.CrmHalted = false;
                    b.CrmFailedRounds = 0;
                    b.CrmNextAttemptAt = "";
                }
                else
                {
                    b.CrmLastError = error ?? "";
                    b.CrmHalted = outcome == Outcome.Refused;
                }
                return true;
            }, ct);
            return (outcome, saved);
        }
        finally
        {
            gate.Release();
        }
    }

    private static MeetingBooking Copy(MeetingBooking b) =>
        JsonSerializer.Deserialize<MeetingBooking>(JsonSerializer.Serialize(b))!;

    /// <summary>
    /// The exact body posted to the CRM. From an invitation: its organisation,
    /// lead and code. A walk-in: <paramref name="walkInOrganizationId"/>, and no
    /// lead id or code (null).
    /// </summary>
    internal static byte[] MeetingBody(MeetingBooking b, string? walkInOrganizationId = null) => JsonSerializer.SerializeToUtf8Bytes(new
    {
        organizationId = walkInOrganizationId ?? b.CrmOrganizationId,
        leadId = walkInOrganizationId is null ? b.CrmLeadId : null,
        code = walkInOrganizationId is null ? b.Code : null,
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

    private async Task<(Outcome, string?)> PostMeetingAsync(Uri url, MeetingBooking booking, bool walkIn, CancellationToken ct)
    {
        // The secret may have been removed since the booking: nothing can be signed.
        if (!_cadence.IsConfigured())
        {
            _logger.LogWarning("meetings.crm.not_configured booking={Booking}", booking.Id);
            return (Outcome.Refused, "CADENCE_ONBOARDING_SECRET is not set, so nothing can be signed for CadenceE.");
        }
        if (string.IsNullOrWhiteSpace(MeetingCalendar.StartsAt(booking.Date, booking.Time)))
        {
            return (Outcome.Refused, "The booking's date or time is not valid.");
        }
        try
        {
            var body = MeetingBody(booking, walkIn ? _cadence.OrganizationId.Trim() : null);
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
                return (Outcome.Done, null);
            }
            _logger.LogWarning("meetings.crm.refused host={Host} booking={Booking} event={Event} status={Status}", url.Host, booking.Id, booking.Status, status);
            // 401: the secrets differ; 400/404: it will never take this post as
            // it is. Those need a fix, not a retry.
            return status is 408 or 429 or >= 500
                ? (Outcome.Retry, $"CadenceE did not answer properly (HTTP {status}); retrying.")
                : (Outcome.Refused, status switch
                {
                    401 or 403 => $"CadenceE refused the signature (HTTP {status}): check that both sides share the same CADENCE_ONBOARDING_SECRET.",
                    404 => "CadenceE does not know this address or workspace (HTTP 404).",
                    _ => $"CadenceE refused the booking (HTTP {status}).",
                });
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            return (Outcome.Retry, "Interrupted.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning("meetings.crm.unreachable host={Host} booking={Booking} error={Error}", url.Host, booking.Id, ex.GetType().Name);
            return (Outcome.Retry, $"CadenceE could not be reached ({ex.GetType().Name}); retrying.");
        }
    }

    private async Task<(Outcome, string?)> PostLeadAsync(MeetingBooking booking, CancellationToken ct)
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
                return (Outcome.Done, null);
            }
            if (result.Skipped)
            {
                _logger.LogWarning("meetings.lead.skipped booking={Booking} reason={Reason}", booking.Id, result.Reason);
                return (Outcome.Refused, "The leads webhook is not configured (LEADS_WEBHOOK_URL, LEADS_WEBHOOK_API_KEY).");
            }
            return result.HttpStatus is null or 408 or 429 or >= 500
                ? (Outcome.Retry, $"The leads webhook did not answer properly ({result.Error}); retrying.")
                : (Outcome.Refused, $"The leads webhook refused the lead (HTTP {result.HttpStatus}).");
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            return (Outcome.Retry, "Interrupted.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning("meetings.lead.failed booking={Booking} error={Error}", booking.Id, ex.GetType().Name);
            return (Outcome.Retry, $"The leads webhook could not be reached ({ex.GetType().Name}); retrying.");
        }
    }
}
