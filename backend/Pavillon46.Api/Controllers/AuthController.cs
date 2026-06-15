using Microsoft.AspNetCore.Mvc;
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
    private readonly ILogger<AuthController> _logger;

    public AuthController(IMemberStore members, ITokenService tokens, ILogger<AuthController> logger)
    {
        _members = members;
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
}
