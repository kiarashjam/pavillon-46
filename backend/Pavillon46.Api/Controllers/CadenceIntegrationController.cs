using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;
using Pavillon46.Api.Services;

namespace Pavillon46.Api.Controllers;

/// <summary>
/// Where the CadenceE CRM hands over a new member when a deal is won there.
/// Anonymous, and proven instead by an HMAC signature with the secret both sides
/// share (<c>CADENCE_ONBOARDING_SECRET</c>). See backend/README.md for the contract.
/// </summary>
/// <remarks>
/// The signature is checked over the raw request bytes, before anything is
/// parsed, and covers the timestamp as well as the body, so a captured handoff
/// cannot be replayed once <see cref="CadenceOptions.SignatureToleranceSeconds"/>
/// have passed. Within that window a replay carries the same event id, which
/// <see cref="CadenceOnboardingService"/> answers from its record without acting again.
/// </remarks>
[ApiController]
[Route("api/integrations/cadence")]
public class CadenceIntegrationController : ControllerBase
{
    // A designed email, JSON-escaped (System.Text.Json writes every < and > as
    // six characters), fits well within this.
    private const int MaxBodyBytes = 4 * 1024 * 1024;
    private const int PerIpMax = 60;
    private const int PerIpWindowMs = 60_000;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly ICadenceOnboardingService _onboarding;
    private readonly IEmailService _email;
    private readonly KeyedRateLimiter _rateLimiter;
    private readonly CadenceOptions _options;
    private readonly ILogger<CadenceIntegrationController> _logger;

    public CadenceIntegrationController(
        ICadenceOnboardingService onboarding,
        IEmailService email,
        KeyedRateLimiter rateLimiter,
        IOptions<CadenceOptions> options,
        ILogger<CadenceIntegrationController> logger)
    {
        _onboarding = onboarding;
        _email = email;
        _rateLimiter = rateLimiter;
        _options = options.Value;
        _logger = logger;
    }

    [HttpPost("onboarding")]
    [RequestSizeLimit(MaxBodyBytes)]
    public async Task<IActionResult> Onboarding(CancellationToken ct)
    {
        // Secrets fail closed: without our own secret, nobody can open accounts here.
        if (!_options.IsConfigured())
        {
            return StatusCode(503, new { message = "This integration is not configured.", errorType = "not_configured" });
        }

        var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        if (_rateLimiter.IsRateLimited("cadence:ip", ip, PerIpMax, PerIpWindowMs))
        {
            return StatusCode(429, new { message = "Too many requests. Please try again later." });
        }

        byte[] body;
        using (var buffer = new MemoryStream())
        {
            await Request.Body.CopyToAsync(buffer, ct);
            body = buffer.ToArray();
        }

        if (!SignatureIsValid(body))
        {
            _logger.LogWarning("cadence.onboarding.bad_signature");
            return Unauthorized(new { message = "Unauthorized." });
        }

        CadenceEnvelope? envelope;
        try
        {
            envelope = JsonSerializer.Deserialize<CadenceEnvelope>(body, Json);
        }
        catch (JsonException)
        {
            envelope = null;
        }
        if (envelope is null || string.IsNullOrWhiteSpace(envelope.Id))
        {
            return BadRequest(new { message = "The body is not a CadenceE event.", errorType = "invalid_handoff" });
        }

        switch (envelope.EventName)
        {
            case "onboarding.ping":
                // Who welcomes go out from by default, so the CRM can show it. Only to
                // a caller holding the secret: the signature was checked above.
                var (fromName, fromEmail) = _email.DefaultSender;
                return Ok(new
                {
                    ok = true,
                    from = string.IsNullOrWhiteSpace(fromEmail) ? null : new { name = fromName, email = fromEmail },
                });

            case "deal.onboarding":
                CadenceOnboardingPayload? payload;
                try
                {
                    payload = envelope.Payload.ValueKind == JsonValueKind.Object
                        ? envelope.Payload.Deserialize<CadenceOnboardingPayload>(Json)
                        : null;
                }
                catch (JsonException)
                {
                    payload = null;
                }
                if (payload is null)
                {
                    return BadRequest(new { message = "The handoff has no payload.", errorType = "invalid_handoff" });
                }
                var (status, result) = await _onboarding.HandleOnboardingAsync(envelope.Id, payload, ct);
                return StatusCode(status, result);

            default:
                // Answered 200 so the CRM does not retry an event this portal
                // has no use for; it is not an error on either side.
                return Ok(new { ok = true, ignored = true });
        }
    }

    /// <summary>
    /// <c>X-Cadence-Signature-256: sha256=&lt;hex HMAC-SHA256(secret, "{timestamp}.{body}")&gt;</c>,
    /// with <c>X-Cadence-Timestamp</c> (Unix seconds) within the tolerance of now.
    /// </summary>
    private bool SignatureIsValid(byte[] body)
    {
        var timestampHeader = Request.Headers["X-Cadence-Timestamp"].ToString().Trim();
        var signatureHeader = Request.Headers["X-Cadence-Signature-256"].ToString().Trim();
        if (!long.TryParse(timestampHeader, NumberStyles.None, CultureInfo.InvariantCulture, out var timestamp)) return false;
        if (!signatureHeader.StartsWith("sha256=", StringComparison.OrdinalIgnoreCase)) return false;

        var tolerance = Math.Clamp(_options.SignatureToleranceSeconds, 30, 3600);
        var skew = Math.Abs(DateTimeOffset.UtcNow.ToUnixTimeSeconds() - timestamp);
        if (skew > tolerance) return false;

        var prefix = Encoding.UTF8.GetBytes(timestampHeader + ".");
        var signed = new byte[prefix.Length + body.Length];
        Buffer.BlockCopy(prefix, 0, signed, 0, prefix.Length);
        Buffer.BlockCopy(body, 0, signed, prefix.Length, body.Length);
        var expected = Convert.ToHexString(
            HMACSHA256.HashData(Encoding.UTF8.GetBytes(_options.OnboardingSecret.Trim()), signed)).ToLowerInvariant();

        var given = signatureHeader["sha256=".Length..].Trim().ToLowerInvariant();
        var expectedBytes = Encoding.UTF8.GetBytes(expected);
        var givenBytes = Encoding.UTF8.GetBytes(given);
        // FixedTimeEquals returns false for different lengths without leaking where they differ.
        return CryptographicOperations.FixedTimeEquals(expectedBytes, givenBytes);
    }
}
