using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;
using Pavillon46.Api.Security;
using Pavillon46.Api.Services;

namespace Pavillon46.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IMemberStore _members;
    private readonly ITokenService _tokens;
    private readonly IPasswordResetTokenStore _resetTokens;
    private readonly IEmailService _email;
    private readonly KeyedRateLimiter _rateLimiter;
    private readonly AuthOptions _auth;
    private readonly SiteOptions _site;
    private readonly ActivityOptions _activity;
    private readonly ILogger<AuthController> _logger;

    // Rate-limit budgets — kept as constants near the endpoints so operators can
    // find them without spelunking through options.
    private const int ForgotPerEmailMax = 3;
    private const int ForgotPerEmailWindowMs = 15 * 60_000;
    private const int ForgotPerIpMax = 20;
    private const int ForgotPerIpWindowMs = 60 * 60_000;
    private const int ResetPerIpMax = 10;
    private const int ResetPerIpWindowMs = 15 * 60_000;
    private const int ResetPerTokenMax = 5;
    private const int ResetPerTokenWindowMs = 60 * 60_000;

    public AuthController(
        IMemberStore members,
        ITokenService tokens,
        IPasswordResetTokenStore resetTokens,
        IEmailService email,
        KeyedRateLimiter rateLimiter,
        IOptions<AuthOptions> auth,
        IOptions<SiteOptions> site,
        IOptions<ActivityOptions> activity,
        ILogger<AuthController> logger)
    {
        _members = members;
        _tokens = tokens;
        _resetTokens = resetTokens;
        _email = email;
        _rateLimiter = rateLimiter;
        _auth = auth.Value;
        _site = site.Value;
        _activity = activity.Value;
        _logger = logger;
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest? body, CancellationToken ct)
    {
        var email = body?.Email?.Trim() ?? "";
        var password = body?.Password ?? "";
        if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(password))
        {
            return BadRequest(new { message = "Email and password are required." });
        }

        // Generic error for both "not found" and "bad password" to avoid leaking
        // which member emails exist.
        var member = await _members.GetByEmailAsync(email, ct);
        if (member is null || !PasswordHasher.Verify(password, member.PasswordHash))
        {
            return Unauthorized(new { message = "Invalid email or password." });
        }

        if (!string.Equals(member.Status, "active", StringComparison.OrdinalIgnoreCase))
        {
            return StatusCode(403, new { message = "This account is not active. Please contact Pavillon 46." });
        }

        member.LastLoginAt = DateTime.UtcNow.ToString("o");
        await _members.UpsertAsync(member, ct);

        var (token, expiresAt) = _tokens.Create(member);
        return Ok(new LoginResponse
        {
            Token = token,
            ExpiresAt = expiresAt.UtcDateTime.ToString("o"),
            Member = MemberDto.From(member),
        });
    }

    // -----------------------------------------------------------------------
    // Forgot password — ALWAYS returns 200 { ok: true } when the request is
    // well-formed. This is the anti-enumeration guarantee: the caller cannot
    // learn whether the email is on our member roll from the response body,
    // status code, or (see below) latency envelope.
    // -----------------------------------------------------------------------
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest? body, CancellationToken ct)
    {
        var rawEmail = body?.Email?.Trim() ?? "";
        if (string.IsNullOrEmpty(rawEmail) || !LooksLikeEmail(rawEmail))
        {
            return BadRequest(new { message = "Email is required." });
        }

        var email = rawEmail.ToLowerInvariant();
        var ip = GetClientIp();
        var ipKey = string.IsNullOrEmpty(ip) ? "unknown" : ip;

        // Per-email and per-IP rate limits. Both must pass.
        if (_rateLimiter.IsRateLimited("forgot:email", email, ForgotPerEmailMax, ForgotPerEmailWindowMs)
            || _rateLimiter.IsRateLimited("forgot:ip", ipKey, ForgotPerIpMax, ForgotPerIpWindowMs))
        {
            _logger.LogWarning("forgot-password.rate_limited email={Email} ip={Ip}", email, HashIp(ipKey));
            return StatusCode(429, new { message = "Too many requests. Please try again later." });
        }

        _logger.LogInformation("forgot-password.request email={Email} ip={Ip}", email, HashIp(ipKey));

        var member = await _members.GetByEmailAsync(email, ct);
        var memberIsResettable = member is not null
            && string.Equals(member.Status, "active", StringComparison.OrdinalIgnoreCase);

        if (memberIsResettable)
        {
            try
            {
                // Invalidate any outstanding tokens for this member so that a
                // click on the newest email always wins and older emails are
                // dead on arrival.
                await _resetTokens.InvalidateAllForMemberAsync(member!.Id, "superseded", ct, "member");

                var raw = ResetTokenGenerator.GenerateRaw();
                var hash = ResetTokenGenerator.Hash(raw);
                var now = DateTime.UtcNow;
                var ttlMinutes = Math.Max(5, _auth.PasswordResetTtlMinutes);
                var expiresAt = now.AddMinutes(ttlMinutes);

                var row = new PasswordResetToken
                {
                    Id = hash,
                    TokenHash = hash,
                    MemberId = member.Id,
                    Audience = "member",
                    Email = member.Email.Trim().ToLowerInvariant(),
                    CreatedAtUtc = now.ToString("o"),
                    ExpiresAtUtc = expiresAt.ToString("o"),
                    UsedAtUtc = null,
                    UsedReason = null,
                    RequestIp = HashIp(ipKey),
                    RequestUserAgent = ClampUa(Request.Headers.UserAgent.ToString()),
                };
                await _resetTokens.UpsertAsync(row, ct);

                var resetUrl = _site.Page($"reset-password?token={Uri.EscapeDataString(raw)}");

                _logger.LogInformation(
                    "forgot-password.email_queued memberId={MemberId} tokenPrefix={TokenPrefix} expiresAt={ExpiresAt}",
                    member.Id, hash[..8], expiresAt.ToString("o"));

                // Await SendGrid so Azure cannot recycle the request before the
                // mail is accepted. Pad both branches so "account exists" is
                // not obvious from response time. Failures stay 200 { ok: true }.
                try
                {
                    var send = _email.SendPasswordResetEmailAsync(
                        member, resetUrl, expiresAt, ttlMinutes, member.PreferredLanguage, CancellationToken.None);
                    await Task.WhenAll(send, Task.Delay(350, CancellationToken.None));
                    _logger.LogInformation("forgot-password.email_sent memberId={MemberId}", member.Id);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "forgot-password.email_delivery_failed memberId={MemberId}", member.Id);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "forgot-password.persist_failed email={Email}", email);
            }
        }
        else
        {
            // Dummy work so the "no member" branch takes broadly similar time
            // to the happy path. Prevents timing-based enumeration.
            _ = ResetTokenGenerator.Hash(ResetTokenGenerator.GenerateRaw());
            var jitter = RandomNumberGenerator.GetInt32(300, 450);
            await Task.Delay(jitter, ct);
        }

        return Ok(new { ok = true });
    }

    // -----------------------------------------------------------------------
    // Reset password — validates the token, updates the member's password, and
    // burns every outstanding token for that member. On any failure returns
    // 400 with an errorType that the frontend can render conditionally.
    // -----------------------------------------------------------------------
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest? body, CancellationToken ct)
    {
        var ip = GetClientIp();
        var ipKey = string.IsNullOrEmpty(ip) ? "unknown" : ip;

        if (_rateLimiter.IsRateLimited("reset:ip", ipKey, ResetPerIpMax, ResetPerIpWindowMs))
        {
            _logger.LogWarning("reset-password.rate_limited ip={Ip}", HashIp(ipKey));
            return StatusCode(429, new { message = "Too many requests. Please try again later." });
        }

        var rawToken = body?.Token?.Trim() ?? "";
        var newPassword = body?.NewPassword ?? "";

        if (string.IsNullOrEmpty(rawToken))
        {
            return BadRequest(new { errorType = "invalid", message = "This reset link is invalid or has expired." });
        }
        if (newPassword.Length < 8)
        {
            return BadRequest(new { errorType = "weak_password", message = "Password must be at least 8 characters." });
        }

        var computedHash = ResetTokenGenerator.Hash(rawToken);

        // Per-token attempt cap — protects against a slow scan of a partially
        // leaked token. The bucket is keyed on the hash of the *submitted*
        // token, so an attacker cannot silently retry across sessions.
        if (_rateLimiter.IsRateLimited("reset:token", computedHash, ResetPerTokenMax, ResetPerTokenWindowMs))
        {
            _logger.LogWarning("reset-password.token_burned_brute_force tokenPrefix={TokenPrefix}", computedHash[..8]);
            var existing = await _resetTokens.GetByHashAsync(computedHash, ct);
            if (existing is not null && existing.UsedAtUtc is null)
            {
                existing.UsedAtUtc = DateTime.UtcNow.ToString("o");
                existing.UsedReason = "brute_force";
                await _resetTokens.UpsertAsync(existing, ct);
            }
            return BadRequest(new { errorType = "invalid", message = "This reset link is invalid or has expired." });
        }

        var row = await _resetTokens.GetByHashAsync(computedHash, ct);
        if (row is null || row.IsAdminAudience())
        {
            _logger.LogWarning("reset-password.invalid_token tokenPrefix={TokenPrefix} reason={Reason}",
                computedHash[..8], row is null ? "unknown" : "wrong_audience");
            return BadRequest(new { errorType = "invalid", message = "This reset link is invalid or has expired." });
        }

        // Defense-in-depth: byte-level constant-time check even though the
        // lookup was already a deterministic hash equality on the RowKey.
        if (!ResetTokenGenerator.HashesEqual(row.TokenHash, computedHash))
        {
            _logger.LogWarning("reset-password.invalid_token tokenPrefix={TokenPrefix} reason=mismatch", computedHash[..8]);
            return BadRequest(new { errorType = "mismatch", message = "This reset link is invalid or has expired." });
        }

        if (!string.IsNullOrEmpty(row.UsedAtUtc))
        {
            _logger.LogWarning("reset-password.invalid_token tokenPrefix={TokenPrefix} reason={Reason}",
                computedHash[..8], row.UsedReason ?? "used");
            return BadRequest(new { errorType = "invalid", message = "This reset link is invalid or has expired." });
        }

        if (TryParseIso(row.ExpiresAtUtc) is not DateTime expiresAt || expiresAt <= DateTime.UtcNow)
        {
            _logger.LogWarning("reset-password.invalid_token tokenPrefix={TokenPrefix} reason=expired", computedHash[..8]);
            return BadRequest(new { errorType = "expired", message = "This reset link is invalid or has expired." });
        }

        var member = await _members.GetByIdAsync(row.MemberId, ct);
        if (member is null)
        {
            _logger.LogWarning("reset-password.invalid_token tokenPrefix={TokenPrefix} reason=member_missing", computedHash[..8]);
            return BadRequest(new { errorType = "invalid", message = "This reset link is invalid or has expired." });
        }
        if (!string.Equals(member.Status, "active", StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning("reset-password.invalid_token tokenPrefix={TokenPrefix} reason=member_inactive", computedHash[..8]);
            return BadRequest(new { errorType = "invalid", message = "This reset link is invalid or has expired." });
        }

        // Fail-closed: burn the token before mutating the member. If the
        // password write throws, the token is still spent — a second click
        // on the same email cannot retry.
        row.UsedAtUtc = DateTime.UtcNow.ToString("o");
        row.UsedReason = "consumed";
        await _resetTokens.UpsertAsync(row, ct);

        member.PasswordHash = PasswordHasher.Hash(newPassword);
        member.MustChangePassword = false;
        // Invalidate every session issued before this reset.
        member.PasswordVersion = unchecked(member.PasswordVersion + 1);
        member.UpdatedAt = DateTime.UtcNow.ToString("o");
        await _members.UpsertAsync(member, ct);

        // Cascade: invalidate every other outstanding token for this member.
        // Guarantees the "at most one live token per member" invariant.
        try
        {
            await _resetTokens.InvalidateAllForMemberAsync(member.Id, "superseded", ct, "member");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "reset-password.cascade_invalidate_failed memberId={MemberId}", member.Id);
        }

        _logger.LogInformation("reset-password.consumed memberId={MemberId} tokenPrefix={TokenPrefix}", member.Id, computedHash[..8]);

        // Best-effort confirmation email; never fail the reset if email is down.
        try
        {
            await _email.SendPasswordChangedAsync(member, member.PreferredLanguage, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Password-changed confirmation email failed for {Email}", member.Email);
        }

        return Ok(new { ok = true });
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    private static bool LooksLikeEmail(string s)
    {
        if (string.IsNullOrWhiteSpace(s)) return false;
        var at = s.IndexOf('@');
        if (at <= 0 || at == s.Length - 1) return false;
        var dot = s.IndexOf('.', at);
        return dot > at && dot < s.Length - 1;
    }

    private static DateTime? TryParseIso(string s) =>
        DateTime.TryParse(s, null, System.Globalization.DateTimeStyles.RoundtripKind, out var dt)
            ? dt.ToUniversalTime()
            : null;

    private static string? ClampUa(string? ua)
    {
        if (string.IsNullOrEmpty(ua)) return null;
        return ua.Length <= 200 ? ua : ua[..200];
    }

    private string GetClientIp()
    {
        // ForwardedHeadersMiddleware (see Program.cs) promotes the proxy-set
        // X-Forwarded-For into RemoteIpAddress and rejects untrusted hops.
        // Never read the raw XFF header here — it would let an attacker cycle
        // fake IPs to bypass the rate limiter and forge audit rows.
        return HttpContext.Connection.RemoteIpAddress?.ToString() ?? "";
    }

    private string HashIp(string ip)
    {
        var salt = string.IsNullOrEmpty(_activity.IpSalt) ? "pavillon46-activity" : _activity.IpSalt;
        var bytes = Encoding.UTF8.GetBytes($"{salt}:{ip}");
        return Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    }
}
