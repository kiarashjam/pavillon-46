using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;
using Twilio;
using Twilio.Exceptions;
using Twilio.Rest.Verify.V2.Service;

namespace Pavillon46.Api.Services;

public class VerificationService : IVerificationService
{
    private readonly TwilioOptions _opts;
    private readonly ILogger<VerificationService> _logger;
    private bool _initialized;
    private readonly object _initLock = new();

    public VerificationService(IOptions<TwilioOptions> opts, ILogger<VerificationService> logger)
    {
        _opts = opts.Value;
        _logger = logger;
    }

    private void EnsureInitialized()
    {
        if (_initialized) return;
        lock (_initLock)
        {
            if (_initialized) return;
            if (string.IsNullOrWhiteSpace(_opts.AccountSid) || string.IsNullOrWhiteSpace(_opts.AuthToken))
                throw new InvalidOperationException("Twilio config is missing.");
            TwilioClient.Init(_opts.AccountSid, _opts.AuthToken);
            _initialized = true;
        }
    }

    private static string Normalize(string countryCode, string phoneNumber) =>
        ($"{countryCode}{phoneNumber}").Replace(" ", "");

    public async Task<SendVerificationResult> SendCodeAsync(string countryCode, string phoneNumber, CancellationToken ct = default)
    {
        EnsureInitialized();
        if (string.IsNullOrWhiteSpace(_opts.VerifyServiceSid))
            throw new InvalidOperationException("TWILIO_VERIFY_SERVICE_SID is missing.");

        try
        {
            var verification = await VerificationResource.CreateAsync(
                to: Normalize(countryCode, phoneNumber),
                channel: "sms",
                pathServiceSid: _opts.VerifyServiceSid);
            return new SendVerificationResult(true, verification.Status);
        }
        catch (ApiException ex)
        {
            _logger.LogError(ex, "Twilio send verification failed");
            return new SendVerificationResult(false, "error", ex.Message);
        }
    }

    public async Task<VerifyCodeResult> CheckCodeAsync(string countryCode, string phoneNumber, string code, CancellationToken ct = default)
    {
        EnsureInitialized();
        if (string.IsNullOrWhiteSpace(_opts.VerifyServiceSid))
            throw new InvalidOperationException("TWILIO_VERIFY_SERVICE_SID is missing.");

        try
        {
            var check = await VerificationCheckResource.CreateAsync(
                to: Normalize(countryCode, phoneNumber),
                code: code,
                pathServiceSid: _opts.VerifyServiceSid);

            return check.Status == "approved"
                ? new VerifyCodeResult(VerifyResultKind.Approved)
                : new VerifyCodeResult(VerifyResultKind.InvalidCode);
        }
        catch (ApiException ex)
        {
            _logger.LogError(ex, "Twilio verify check failed (code={Code}, status={Status})", ex.Code, ex.Status);
            // 20404 / 404 → VerificationCheck not found (expired)
            if (ex.Code == 20404 || ex.Status == 404)
                return new VerifyCodeResult(VerifyResultKind.Expired, ex.Message);
            // 60202 → Max check attempts reached
            if (ex.Code == 60202)
                return new VerifyCodeResult(VerifyResultKind.MaxAttempts, ex.Message);
            // 60203 → Max send attempts reached
            if (ex.Code == 60203)
                return new VerifyCodeResult(VerifyResultKind.RateLimit, ex.Message);
            return new VerifyCodeResult(VerifyResultKind.ServerError, ex.Message);
        }
    }
}
