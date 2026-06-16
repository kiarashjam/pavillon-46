using Microsoft.AspNetCore.Mvc;
using Pavillon46.Api.Models;
using Pavillon46.Api.Security;
using Pavillon46.Api.Services;

namespace Pavillon46.Api.Controllers;

/// <summary>
/// Admin account authentication — the dedicated login that replaced the shared
/// admin key. Mirrors <see cref="AuthController"/> but against the admin store,
/// issuing an admin-scoped token and supporting the forced first-login reset.
/// </summary>
[ApiController]
[Route("api/admin/auth")]
public class AdminAuthController : ControllerBase
{
    private readonly IAdminStore _admins;
    private readonly ITokenService _tokens;
    private readonly ILogger<AdminAuthController> _logger;

    public AdminAuthController(IAdminStore admins, ITokenService tokens, ILogger<AdminAuthController> logger)
    {
        _admins = admins;
        _tokens = tokens;
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

        var (token, expiresAt) = _tokens.CreateForAdmin(admin);
        return Ok(new AdminLoginResponse
        {
            Token = token,
            ExpiresAt = expiresAt.UtcDateTime.ToString("o"),
            Admin = AdminDto.From(admin),
        });
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

        admin.PasswordHash = PasswordHasher.Hash(newPassword);
        admin.MustChangePassword = false;
        admin.UpdatedAt = DateTime.UtcNow.ToString("o");
        await _admins.UpsertAsync(admin, ct);

        return Ok(AdminDto.From(admin));
    }

    private async Task<Admin?> CurrentAdminAsync(CancellationToken ct)
    {
        var principal = HttpContext.GetAdmin();
        if (principal is null) return null;
        return await _admins.GetByIdAsync(principal.MemberId, ct);
    }
}
