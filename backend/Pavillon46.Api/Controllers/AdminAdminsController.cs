using Microsoft.AspNetCore.Mvc;
using Pavillon46.Api.Models;
using Pavillon46.Api.Security;
using Pavillon46.Api.Services;

namespace Pavillon46.Api.Controllers;

/// <summary>
/// Directory of admin accounts. Every signed-in admin can list, invite, edit
/// and retire colleagues. The last active admin — and the caller themselves —
/// cannot be deleted or deactivated, so the desk can never lock itself out.
/// </summary>
[ApiController]
[Route("api/admin/admins")]
[AdminAuthorize]
public class AdminAdminsController : ControllerBase
{
    private readonly IAdminStore _admins;
    private readonly IPasswordResetTokenStore _resetTokens;
    private readonly IEmailService _email;
    private readonly ILogger<AdminAdminsController> _logger;

    public AdminAdminsController(
        IAdminStore admins,
        IPasswordResetTokenStore resetTokens,
        IEmailService email,
        ILogger<AdminAdminsController> logger)
    {
        _admins = admins;
        _resetTokens = resetTokens;
        _email = email;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var rows = await _admins.ListAsync(ct);
        var dtos = rows
            .OrderByDescending(a => a.CreatedAt, StringComparer.Ordinal)
            .Select(AdminDto.From)
            .ToList();
        return Ok(new
        {
            admins = dtos,
            total = dtos.Count,
            active = dtos.Count(a => string.Equals(a.Status, "active", StringComparison.OrdinalIgnoreCase)),
        });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAdminRequest? body, CancellationToken ct)
    {
        var email = body?.Email?.Trim() ?? "";
        var firstName = body?.FirstName?.Trim() ?? "";
        var lastName = body?.LastName?.Trim() ?? "";

        if (string.IsNullOrEmpty(email) || !email.Contains('@'))
            return BadRequest(new { message = "A valid email is required." });
        if (string.IsNullOrEmpty(firstName) || string.IsNullOrEmpty(lastName))
            return BadRequest(new { message = "First and last name are required." });

        var existing = await _admins.GetByEmailAsync(email, ct);
        if (existing is not null)
            return Conflict(new { message = "An admin with this email already exists." });

        var password = PasswordHasher.GeneratePassword();
        var now = DateTime.UtcNow.ToString("o");
        var admin = new Admin
        {
            Id = Guid.NewGuid().ToString("N"),
            Email = email.ToLowerInvariant(),
            PasswordHash = PasswordHasher.Hash(password),
            Title = body?.Title?.Trim() ?? "",
            FirstName = firstName,
            LastName = lastName,
            Role = "admin",
            Status = "active",
            MustChangePassword = true,
            CreatedAt = now,
            UpdatedAt = now,
        };

        await _admins.UpsertAsync(admin, ct);

        var emailSent = false;
        string? emailError = null;
        if (body?.SendEmail == true)
        {
            try
            {
                await _email.SendAdminCredentialsAsync(admin, password, ct);
                emailSent = true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send admin credentials to {Email}", email);
                emailError = ex.Message;
            }
        }

        return Ok(new CreateAdminResponse
        {
            Admin = AdminDto.From(admin),
            Password = password,
            EmailSent = emailSent,
            EmailError = emailError,
        });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] UpdateAdminRequest? body, CancellationToken ct)
    {
        var admin = await _admins.GetByIdAsync(id, ct);
        if (admin is null) return NotFound(new { message = "Admin not found." });

        var me = HttpContext.GetAdmin()?.MemberId ?? "";
        var isSelf = string.Equals(me, admin.Id, StringComparison.Ordinal);

        if (body?.Email is not null)
        {
            var newEmail = body.Email.Trim().ToLowerInvariant();
            if (string.IsNullOrEmpty(newEmail) || !newEmail.Contains('@'))
                return BadRequest(new { message = "A valid email is required." });
            if (!string.Equals(newEmail, admin.Email, StringComparison.OrdinalIgnoreCase))
            {
                var clash = await _admins.GetByEmailAsync(newEmail, ct);
                if (clash is not null && !string.Equals(clash.Id, admin.Id, StringComparison.Ordinal))
                    return Conflict(new { message = "Another admin already uses this email." });
                admin.Email = newEmail;
            }
        }

        if (body?.Title is not null) admin.Title = body.Title.Trim();
        if (body?.FirstName is not null) admin.FirstName = body.FirstName.Trim();
        if (body?.LastName is not null) admin.LastName = body.LastName.Trim();

        if (body?.Status is not null)
        {
            var status = body.Status.Trim().ToLowerInvariant();
            if (status is not ("active" or "inactive" or "suspended"))
                return BadRequest(new { message = "Status must be one of: active, inactive, suspended." });

            var becomingInactive = status != "active" && admin.IsActive();
            if (becomingInactive)
            {
                if (isSelf)
                    return Conflict(new { message = "You cannot deactivate your own account." });
                if (await ActiveAdminCountAsync(ct) <= 1)
                    return Conflict(new { message = "The last active admin cannot be deactivated." });
            }

            admin.Status = status;
        }

        admin.UpdatedAt = DateTime.UtcNow.ToString("o");
        await _admins.UpsertAsync(admin, ct);
        return Ok(AdminDto.From(admin));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
    {
        var admin = await _admins.GetByIdAsync(id, ct);
        if (admin is null) return NotFound(new { message = "Admin not found." });

        var me = HttpContext.GetAdmin()?.MemberId ?? "";
        if (string.Equals(me, admin.Id, StringComparison.Ordinal))
            return Conflict(new { message = "You cannot delete your own account." });

        if (admin.IsActive() && await ActiveAdminCountAsync(ct) <= 1)
        {
            return Conflict(new { message = "The last active admin cannot be deleted." });
        }

        await _admins.DeleteAsync(admin.Id, ct);
        try
        {
            await _resetTokens.InvalidateAllForMemberAsync(admin.Id, "password_changed", ct, "admin");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to invalidate reset tokens for deleted admin {Id}", admin.Id);
        }

        _logger.LogInformation("Admin {Actor} deleted admin {Id} ({Email})", me, admin.Id, admin.Email);
        return Ok(new { ok = true, id = admin.Id });
    }

    [HttpPost("{id}/reset-password")]
    public async Task<IActionResult> ResetPassword(string id, [FromQuery] bool sendEmail, CancellationToken ct)
    {
        var admin = await _admins.GetByIdAsync(id, ct);
        if (admin is null) return NotFound(new { message = "Admin not found." });

        var password = PasswordHasher.GeneratePassword();
        admin.PasswordHash = PasswordHasher.Hash(password);
        admin.MustChangePassword = true;
        admin.PasswordVersion = unchecked(admin.PasswordVersion + 1);
        admin.UpdatedAt = DateTime.UtcNow.ToString("o");
        await _admins.UpsertAsync(admin, ct);

        try
        {
            await _resetTokens.InvalidateAllForMemberAsync(admin.Id, "password_changed", ct, "admin");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to invalidate reset tokens for admin {Id} after reset", admin.Id);
        }

        var emailSent = false;
        string? emailError = null;
        if (sendEmail)
        {
            try
            {
                await _email.SendAdminCredentialsAsync(admin, password, ct);
                emailSent = true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send reset credentials to {Email}", admin.Email);
                emailError = ex.Message;
            }
        }

        return Ok(new CreateAdminResponse
        {
            Admin = AdminDto.From(admin),
            Password = password,
            EmailSent = emailSent,
            EmailError = emailError,
        });
    }

    private async Task<int> ActiveAdminCountAsync(CancellationToken ct)
    {
        var all = await _admins.ListAsync(ct);
        return all.Count(a => a.IsActive());
    }
}
