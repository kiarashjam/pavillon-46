using Microsoft.AspNetCore.Mvc;
using Pavillon46.Api.Models;
using Pavillon46.Api.Services;

namespace Pavillon46.Api.Controllers;

[ApiController]
[Route("api")]
public class VerificationController : ControllerBase
{
    private readonly IVerificationService _verify;

    public VerificationController(IVerificationService verify)
    {
        _verify = verify;
    }

    [HttpPost("send-verification")]
    public async Task<IActionResult> SendVerification([FromBody] SendVerificationRequest body, CancellationToken ct)
    {
        if (body is null || string.IsNullOrWhiteSpace(body.CountryCode) || string.IsNullOrWhiteSpace(body.PhoneNumber))
        {
            return BadRequest(new { message = "Phone number is required" });
        }

        try
        {
            var result = await _verify.SendCodeAsync(body.CountryCode!, body.PhoneNumber!, ct);
            if (!result.Ok)
            {
                return StatusCode(500, new
                {
                    message = "Error sending verification code",
                    detail = result.ErrorDetail ?? result.Status,
                });
            }
            return Ok(new { message = "Verification code sent", status = result.Status });
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(500, new { message = "Server configuration error", detail = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Error sending verification code", detail = ex.Message });
        }
    }

    [HttpPost("verify-code")]
    public async Task<IActionResult> VerifyCode([FromBody] VerifyCodeRequest body, CancellationToken ct)
    {
        if (body is null || string.IsNullOrWhiteSpace(body.CountryCode) || string.IsNullOrWhiteSpace(body.PhoneNumber) || string.IsNullOrWhiteSpace(body.Code))
        {
            return BadRequest(new { message = "Phone number and code are required", verified = false });
        }

        try
        {
            var result = await _verify.CheckCodeAsync(body.CountryCode!, body.PhoneNumber!, body.Code!, ct);
            return result.Kind switch
            {
                VerifyResultKind.Approved => Ok(new { message = "Phone verified successfully", verified = true }),
                VerifyResultKind.InvalidCode => BadRequest(new { message = "Invalid verification code", verified = false, errorType = "invalid_code" }),
                VerifyResultKind.Expired => BadRequest(new { message = "Verification expired or not found. Please request a new code.", verified = false, errorType = "expired" }),
                VerifyResultKind.MaxAttempts => BadRequest(new { message = "Too many attempts. Please request a new code.", verified = false, errorType = "max_attempts" }),
                VerifyResultKind.RateLimit => StatusCode(429, new { message = "Too many verification requests. Please wait before trying again.", verified = false, errorType = "rate_limit" }),
                _ => StatusCode(500, new { message = "Error verifying code", verified = false, errorType = "server_error", detail = result.ErrorDetail })
            };
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(500, new { message = "Server configuration error", verified = false, detail = ex.Message });
        }
    }
}
