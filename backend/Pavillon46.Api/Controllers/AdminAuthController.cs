using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;
using Pavillon46.Api.Security;
using Pavillon46.Api.Services;

namespace Pavillon46.Api.Controllers;

/// <summary>
/// Admin account authentication — dedicated login, forced first-login reset,
/// and the self-serve forgot / reset password flow (mirrors
/// <see cref="AuthController"/> against the admin store).
/// </summary>
[ApiController]
[Route("api/admin/auth")]
public class AdminAuthController : ControllerBase
{
    private readonly IAdminStore _admins;
    private readonly ITokenService _tokens;
    private readonly IPasswordResetTokenStore _resetTokens;
    private readonly IEmailService _email;
    private readonly KeyedRateLimiter _rateLimiter;
    private readonly AuthOptions _auth;
    private readonly SiteOptions _site;
    private readonly ActivityOptions _activity;
    private readonly ILogger<AdminAuthController> _logger;

    private const int ForgotPerEmailMax = 3;
    private const int ForgotPerEmailWindowMs = 15 * 60_000;
    private const int ForgotPerIpMax = 20;
    private const int ForgotPerIpWindowMs = 60 * 60_000;
    private const int ResetPerIpMax = 10;
    private const int ResetPerIpWindowMs = 15 * 60_000;
    private const int ResetPerTokenMax = 5;
    private const int ResetPerTokenWindowMs = 60 * 60_000;

    public AdminAuthController(
        IAdminStore admins,
        ITokenService tokens,
        IPasswordResetTokenStore resetTokens,
        IEmailService email,
        KeyedRateLimiter rateLimiter,
        IOptions<AuthOptions> auth,
        IOptions<SiteOptions> site,
        IOptions<ActivityOptions> activity,
        ILogger<AdminAuthController> logger)
    {
        _admins = admins;
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
        // which admin emails exist.
        var admin = await _admins.GetByEmailAsync(email, ct);
        if (admin is null || !PasswordHasher.Verify(password, admin.PasswordHash))
        {
            return Unauthorized(new { message = "Invalid email or password." });
        }

        if (!string.Equals(admin.Status, "active", StringComparison.OrdinalIgnoreCase))
        {
            return StatusCode(403, new { message = "This admin account is not active." });
        }

        admin.LastLoginAt = DateTime.UtcNow.ToString("o");
        await _admins.UpsertAsync(admin, ct);

        return Ok(SessionResponse(admin));
    }

    [HttpGet("me")]
    [AdminAuthorize]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        var admin = await CurrentAdminAsync(ct);
        if (admin is null) return Unauthorized(new { message = "Admin not found." });
        return Ok(AdminDto.From(admin));
    }

    [HttpPost("change-password")]
    [AdminAuthorize]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest body, CancellationToken ct)
    {
        var admin = await CurrentAdminAsync(ct);
        if (admin is null) return Unauthorized(new { message = "Admin not found." });

        var newPassword = body.NewPassword ?? "";
        if (newPassword.Length < 8)
        {
            return BadRequest(new { message = "Your new password must be at least 8 characters." });
        }

        // Outside the forced-reset state, require the current password to authorize.
        if (!admin.MustChangePassword)
        {
            if (string.IsNullOrEmpty(body.CurrentPassword) || !PasswordHasher.Verify(body.CurrentPassword, admin.PasswordHash))
            {
                return BadRequest(new { message = "Your current password is incorrect." });
            }
        }

        ApplyNewPassword(admin, newPassword);
        await _admins.UpsertAsync(admin, ct);

        try
        {
            await _resetTokens.InvalidateAllForMemberAsync(admin.Id, "password_changed", ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to invalidate reset tokens for admin {AdminId} after password change", admin.Id);
        }

        try
        {
            await _email.SendAdminPasswordChangedAsync(admin, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Admin password-changed confirmation email failed for {Email}", admin.Email);
        }

        // Re-issue a token with the new password version so this session stays
        // valid after the bump (the previous token is now rejected).
        return Ok(SessionResponse(admin));
    }

    // -----------------------------------------------------------------------
    // Forgot password — ALWAYS returns 200 { ok: true } when the request is
    // well-formed. Same anti-enumeration contract as the member flow.
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

        if (_rateLimiter.IsRateLimited("admin-forgot:email", email, ForgotPerEmailMax, ForgotPerEmailWindowMs)
            || _rateLimiter.IsRateLimited("admin-forgot:ip", ipKey, ForgotPerIpMax, ForgotPerIpWindowMs))
        {
            _logger.LogWarning("admin-forgot-password.rate_limited email={Email} ip={Ip}", email, HashIp(ipKey));
            return StatusCode(429, new { message = "Too many requests. Please try again later." });
        }

        _logger.LogInformation("admin-forgot-password.request email={Email} ip={Ip}", email, HashIp(ipKey));

        var admin = await _admins.GetByEmailAsync(email, ct);
        var resettable = admin is not null
            && string.Equals(admin.Status, "active", StringComparison.OrdinalIgnoreCase);

        if (resettable)
        {
            try
            {
                await _resetTokens.InvalidateAllForMemberAsync(admin!.Id, "superseded", ct);

                var raw = ResetTokenGenerator.GenerateRaw();
                var hash = ResetTokenGenerator.Hash(raw);
                var now = DateTime.UtcNow;
                var ttlMinutes = Math.Max(5, _auth.PasswordResetTtlMinutes);
                var expiresAt = now.AddMinutes(ttlMinutes);

                var row = new PasswordResetToken
                {
                    Id = hash,
                    TokenHash = hash,
                    MemberId = admin.Id,
                    Audience = "admin",
                    Email = admin.Email.Trim().ToLowerInvariant(),
                    CreatedAtUtc = now.ToString("o"),
                    ExpiresAtUtc = expiresAt.ToString("o"),
                    UsedAtUtc = null,
                    UsedReason = null,
                    RequestIp = HashIp(ipKey),
                    RequestUserAgent = ClampUa(Request.Headers.UserAgent.ToString()),
                };
                await _resetTokens.UpsertAsync(row, ct);

                var resetUrl = $"{_site.Url.TrimEnd('/')}/admin/reset-password?token={Uri.EscapeDataString(raw)}";

                _logger.LogInformation(
                    "admin-forgot-password.email_queued adminId={AdminId} tokenPrefix={TokenPrefix} expiresAt={ExpiresAt}",
                    admin.Id, hash[..8], expiresAt.ToString("o"));

                var adminSnapshot = admin;
                var expiresAtCopy = expiresAt;
                var ttlMinutesCopy = ttlMinutes;
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await _email.SendAdminPasswordResetEmailAsync(
                            adminSnapshot, resetUrl, expiresAtCopy, ttlMinutesCopy, CancellationToken.None);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "admin-forgot-password.email_delivery_failed adminId={AdminId}", adminSnapshot.Id);
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "admin-forgot-password.persist_failed email={Email}", email);
            }
        }
        else
        {
            _ = ResetTokenGenerator.Hash(ResetTokenGenerator.GenerateRaw());
            var jitter = RandomNumberGenerator.GetInt32(50, 200);
            await Task.Delay(jitter, ct);
        }

        return Ok(new { ok = true });
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest? body, CancellationToken ct)
    {
        var ip = GetClientIp();
        var ipKey = string.IsNullOrEmpty(ip) ? "unknown" : ip;

        if (_rateLimiter.IsRateLimited("admin-reset:ip", ipKey, ResetPerIpMax, ResetPerIpWindowMs))
        {
            _logger.LogWarning("admin-reset-password.rate_limited ip={Ip}", HashIp(ipKey));
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

        if (_rateLimiter.IsRateLimited("admin-reset:token", computedHash, ResetPerTokenMax, ResetPerTokenWindowMs))
        {
            _logger.LogWarning("admin-reset-password.token_burned_brute_force tokenPrefix={TokenPrefix}", computedHash[..8]);
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
        if (row is null || !row.IsAdminAudience())
        {
            _logger.LogWarning("admin-reset-password.invalid_token tokenPrefix={TokenPrefix} reason={Reason}",
                computedHash[..8], row is null ? "unknown" : "wrong_audience");
            return BadRequest(new { errorType = "invalid", message = "This reset link is invalid or has expired." });
        }

        if (!ResetTokenGenerator.HashesEqual(row.TokenHash, computedHash))
        {
            _logger.LogWarning("admin-reset-password.invalid_token tokenPrefix={TokenPrefix} reason=mismatch", computedHash[..8]);
            return BadRequest(new { errorType = "mismatch", message = "This reset link is invalid or has expired." });
        }

        if (!string.IsNullOrEmpty(row.UsedAtUtc))
        {
            _logger.LogWarning("admin-reset-password.invalid_token tokenPrefix={TokenPrefix} reason={Reason}",
                computedHash[..8], row.UsedReason ?? "used");
            return BadRequest(new { errorType = "invalid", message = "This reset link is invalid or has expired." });
        }

        if (TryParseIso(row.ExpiresAtUtc) is not DateTime expiresAt || expiresAt <= DateTime.UtcNow)
        {
            _logger.LogWarning("admin-reset-password.invalid_token tokenPrefix={TokenPrefix} reason=expired", computedHash[..8]);
            return BadRequest(new { errorType = "expired", message = "This reset link is invalid or has expired." });
        }

        var admin = await _admins.GetByIdAsync(row.MemberId, ct);
        if (admin is null || !string.Equals(admin.Status, "active", StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning("admin-reset-password.invalid_token tokenPrefix={TokenPrefix} reason=admin_missing_or_inactive", computedHash[..8]);
            return BadRequest(new { errorType = "invalid", message = "This reset link is invalid or has expired." });
        }

        row.UsedAtUtc = DateTime.UtcNow.ToString("o");
        row.UsedReason = "consumed";
        await _resetTokens.UpsertAsync(row, ct);

        ApplyNewPassword(admin, newPassword);
        await _admins.UpsertAsync(admin, ct);

        try
        {
            await _resetTokens.InvalidateAllForMemberAsync(admin.Id, "superseded", ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "admin-reset-password.cascade_invalidate_failed adminId={AdminId}", admin.Id);
        }

        _logger.LogInformation("admin-reset-password.consumed adminId={AdminId} tokenPrefix={TokenPrefix}", admin.Id, computedHash[..8]);

        try
        {
            await _email.SendAdminPasswordChangedAsync(admin, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Admin password-changed confirmation email failed for {Email}", admin.Email);
        }

        return Ok(new { ok = true });
    }

    private AdminLoginResponse SessionResponse(Admin admin)
    {
        var (token, expiresAt) = _tokens.CreateForAdmin(admin);
        return new AdminLoginResponse
        {
            Token = token,
            ExpiresAt = expiresAt.UtcDateTime.ToString("o"),
            Admin = AdminDto.From(admin),
        };
    }

    private static void ApplyNewPassword(Admin admin, string newPassword)
    {
        admin.PasswordHash = PasswordHasher.Hash(newPassword);
        admin.MustChangePassword = false;
        admin.PasswordVersion = unchecked(admin.PasswordVersion + 1);
        admin.UpdatedAt = DateTime.UtcNow.ToString("o");
    }

    private async Task<Admin?> CurrentAdminAsync(CancellationToken ct)
    {
        var principal = HttpContext.GetAdmin();
        if (principal is null) return null;
        return await _admins.GetByIdAsync(principal.MemberId, ct);
    }

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

    private string GetClientIp() =>
        HttpContext.Connection.RemoteIpAddress?.ToString() ?? "";

    private string HashIp(string ip)
    {
        var salt = string.IsNullOrEmpty(_activity.IpSalt) ? "pavillon46-activity" : _activity.IpSalt;
        var bytes = Encoding.UTF8.GetBytes($"{salt}:{ip}");
        return Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    }
}
