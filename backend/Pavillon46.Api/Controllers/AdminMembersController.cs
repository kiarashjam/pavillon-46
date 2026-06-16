using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;
using Pavillon46.Api.Security;
using Pavillon46.Api.Services;

namespace Pavillon46.Api.Controllers;

[ApiController]
[Route("api/admin")]
[AdminAuthorize]
public class AdminMembersController : ControllerBase
{
    private readonly IMemberStore _members;
    private readonly IApplicantStore _applicants;
    private readonly IEmailService _email;
    private readonly AuthOptions _auth;
    private readonly ILogger<AdminMembersController> _logger;

    public AdminMembersController(
        IMemberStore members,
        IApplicantStore applicants,
        IEmailService email,
        IOptions<AuthOptions> auth,
        ILogger<AdminMembersController> logger)
    {
        _members = members;
        _applicants = applicants;
        _email = email;
        _auth = auth.Value;
        _logger = logger;
    }

    private static string NormalizeLang(string? lang) =>
        string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase) ? "en" : "fr";

    [HttpGet("members")]
    public async Task<IActionResult> ListMembers(CancellationToken ct)
    {        var members = await _members.ListAsync(ct);
        var dtos = members
            .OrderByDescending(m => m.CreatedAt, StringComparer.Ordinal)
            .Select(MemberDto.From)
            .ToList();
        return Ok(new { members = dtos, total = dtos.Count });
    }

    [HttpPost("members")]
    public async Task<IActionResult> CreateMember([FromBody] CreateMemberRequest body, CancellationToken ct)
    {
        var email = body.Email?.Trim() ?? "";
        var firstName = body.FirstName?.Trim() ?? "";
        var lastName = body.LastName?.Trim() ?? "";

        if (string.IsNullOrEmpty(email) || !email.Contains('@'))
        {
            return BadRequest(new { message = "A valid email is required." });
        }
        if (string.IsNullOrEmpty(firstName) || string.IsNullOrEmpty(lastName))
        {
            return BadRequest(new { message = "First and last name are required." });
        }

        var existing = await _members.GetByEmailAsync(email, ct);
        if (existing is not null)
        {
            return Conflict(new { message = "A member with this email already exists." });
        }

        var password = PasswordHasher.GeneratePassword();
        var referralCode = await GenerateUniqueReferralCodeAsync(ct);
        var now = DateTime.UtcNow.ToString("o");

        var member = new Member
        {
            Id = Guid.NewGuid().ToString("N"),
            Email = email,
            PasswordHash = PasswordHasher.Hash(password),
            Title = body.Title?.Trim() ?? "",
            FirstName = firstName,
            LastName = lastName,
            Phone = body.Phone?.Trim() ?? "",
            City = body.City?.Trim() ?? "",
            Country = body.Country?.Trim() ?? "",
            ContractRef = body.ContractRef?.Trim() ?? "",
            Notes = body.Notes?.Trim() ?? "",
            Role = "member",
            Status = "active",
            ReferralCode = referralCode,
            PreferredLanguage = NormalizeLang(body.Language),
            // Temporary password set by admin → force a reset on first login.
            MustChangePassword = true,
            CreatedAt = now,
            UpdatedAt = now,
        };

        await _members.UpsertAsync(member, ct);

        var emailSent = false;
        string? emailError = null;
        if (body.SendEmail)
        {
            try
            {
                await _email.SendMemberCredentialsAsync(member, password, member.PreferredLanguage, ct);
                emailSent = true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send credentials email to {Email}", email);
                emailError = ex.Message;
            }
        }

        return Ok(new CreateMemberResponse
        {
            Member = MemberDto.From(member),
            Password = password,
            EmailSent = emailSent,
            EmailError = emailError,
        });
    }

    [HttpPost("members/send-credentials")]
    public async Task<IActionResult> SendCredentials([FromBody] SendCredentialsRequest body, CancellationToken ct)
    {
        Member? member = null;
        if (!string.IsNullOrWhiteSpace(body.MemberId))
            member = await _members.GetByIdAsync(body.MemberId!.Trim(), ct);
        else if (!string.IsNullOrWhiteSpace(body.Email))
            member = await _members.GetByEmailAsync(body.Email!.Trim(), ct);

        if (member is null) return NotFound(new { message = "Member not found." });
        if (string.IsNullOrWhiteSpace(body.Password))
            return BadRequest(new { message = "Password is required to send credentials." });

        try
        {
            await _email.SendMemberCredentialsAsync(member, body.Password!, member.PreferredLanguage, ct);
            return Ok(new { ok = true, emailSent = true, sentTo = member.Email });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send credentials email to {Email}", member.Email);
            return StatusCode(500, new { ok = false, emailSent = false, message = ex.Message });
        }
    }

    [HttpPost("members/{id}/reset-password")]
    public async Task<IActionResult> ResetPassword(string id, [FromQuery] bool sendEmail, CancellationToken ct)
    {
        var member = await _members.GetByIdAsync(id, ct);
        if (member is null) return NotFound(new { message = "Member not found." });

        var password = PasswordHasher.GeneratePassword();
        member.PasswordHash = PasswordHasher.Hash(password);
        member.MustChangePassword = true;
        member.UpdatedAt = DateTime.UtcNow.ToString("o");
        await _members.UpsertAsync(member, ct);

        var emailSent = false;
        string? emailError = null;
        if (sendEmail)
        {
            try
            {
                await _email.SendMemberCredentialsAsync(member, password, member.PreferredLanguage, ct);
                emailSent = true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send reset credentials email to {Email}", member.Email);
                emailError = ex.Message;
            }
        }

        return Ok(new CreateMemberResponse
        {
            Member = MemberDto.From(member),
            Password = password,
            EmailSent = emailSent,
            EmailError = emailError,
        });
    }

    [HttpPut("members/{id}")]
    public async Task<IActionResult> UpdateMember(string id, [FromBody] UpdateMemberRequest body, CancellationToken ct)
    {
        var member = await _members.GetByIdAsync(id, ct);
        if (member is null) return NotFound(new { message = "Member not found." });

        // Email can be changed, but must stay a valid, unique address.
        if (body.Email is not null)
        {
            var newEmail = body.Email.Trim();
            if (string.IsNullOrEmpty(newEmail) || !newEmail.Contains('@'))
                return BadRequest(new { message = "A valid email is required." });
            if (!string.Equals(newEmail, member.Email, StringComparison.OrdinalIgnoreCase))
            {
                var clash = await _members.GetByEmailAsync(newEmail, ct);
                if (clash is not null && !string.Equals(clash.Id, member.Id, StringComparison.Ordinal))
                    return Conflict(new { message = "Another member already uses this email." });
                member.Email = newEmail;
            }
        }

        if (body.Title is not null) member.Title = body.Title.Trim();
        if (body.FirstName is not null) member.FirstName = body.FirstName.Trim();
        if (body.LastName is not null) member.LastName = body.LastName.Trim();
        if (body.Phone is not null) member.Phone = body.Phone.Trim();
        if (body.City is not null) member.City = body.City.Trim();
        if (body.Country is not null) member.Country = body.Country.Trim();
        if (body.ContractRef is not null) member.ContractRef = body.ContractRef.Trim();
        if (body.Notes is not null) member.Notes = body.Notes.Trim();
        if (body.Language is not null) member.PreferredLanguage = NormalizeLang(body.Language);
        if (body.Status is not null)
        {
            var status = body.Status.Trim().ToLowerInvariant();
            if (status is not ("active" or "inactive" or "suspended"))
                return BadRequest(new { message = "Status must be one of: active, inactive, suspended." });
            member.Status = status;
        }

        member.UpdatedAt = DateTime.UtcNow.ToString("o");
        await _members.UpsertAsync(member, ct);
        return Ok(MemberDto.From(member));
    }

    [HttpDelete("members/{id}")]
    public async Task<IActionResult> DeleteMember(string id, CancellationToken ct)
    {
        var member = await _members.GetByIdAsync(id, ct);
        if (member is null) return NotFound(new { message = "Member not found." });

        await _members.DeleteAsync(member.Id, ct);
        _logger.LogInformation("Admin deleted member {Id} ({Email})", member.Id, member.Email);
        return Ok(new { ok = true, id = member.Id });
    }

    [HttpGet("applicants")]
    public async Task<IActionResult> ListApplicants(CancellationToken ct)
    {        var applicants = await _applicants.ListAsync(ct);
        var dtos = applicants.Select(ApplicantDto.From).ToList();
        return Ok(new
        {
            applicants = dtos,
            total = dtos.Count,
            pending = dtos.Count(a => a.Status is "pending" or "reviewing"),
            accepted = dtos.Count(a => a.Status == "accepted"),
            declined = dtos.Count(a => a.Status == "declined"),
        });
    }

    [HttpPatch("applicants/{id}")]
    public async Task<IActionResult> UpdateApplicant(string id, [FromBody] UpdateApplicantRequest body, CancellationToken ct)
    {
        var allowed = new[] { "pending", "reviewing", "accepted", "declined" };
        var status = (body.Status ?? "").Trim().ToLowerInvariant();
        if (!allowed.Contains(status))
        {
            return BadRequest(new { message = "Status must be one of: pending, reviewing, accepted, declined." });
        }

        var applicant = await _applicants.GetByIdAsync(id, ct);
        if (applicant is null) return NotFound(new { message = "Applicant not found." });

        var becameAccepted = status == "accepted" && applicant.Status != "accepted";
        applicant.Status = status;
        applicant.UpdatedAt = DateTime.UtcNow.ToString("o");

        // Award the referrer bonus once, the first time the referral is accepted.
        if (becameAccepted && !applicant.BonusAwarded && !string.IsNullOrEmpty(applicant.ReferrerMemberId))
        {
            var referrer = await _members.GetByIdAsync(applicant.ReferrerMemberId, ct);
            if (referrer is not null)
            {
                referrer.SuccessfulReferrals += 1;
                referrer.BonusPoints += _auth.ReferralBonusPoints;
                referrer.UpdatedAt = DateTime.UtcNow.ToString("o");
                await _members.UpsertAsync(referrer, ct);
                applicant.BonusAwarded = true;
            }
        }

        await _applicants.UpsertAsync(applicant, ct);
        return Ok(ApplicantDto.From(applicant));
    }

    private async Task<string> GenerateUniqueReferralCodeAsync(CancellationToken ct)
    {
        for (var attempt = 0; attempt < 8; attempt++)
        {
            var code = PasswordHasher.GenerateReferralCode();
            if (await _members.GetByReferralCodeAsync(code, ct) is null) return code;
        }
        // Extremely unlikely; fall back to a guid-suffixed code.
        return "PAV-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
    }
}
