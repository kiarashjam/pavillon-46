using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;
using Pavillon46.Api.Security;
using Pavillon46.Api.Services;

namespace Pavillon46.Api.Controllers;

[ApiController]
[Route("api/members")]
[MemberAuthorize]
public class MembersController : ControllerBase
{
    private readonly IMemberStore _members;
    private readonly IApplicantStore _applicants;
    private readonly IAnnouncementService _announcements;
    private readonly INewsletterStore _newsletters;
    private readonly ILeadsWebhookService _webhook;
    private readonly IEmailService _email;
    private readonly IPasswordResetTokenStore _resetTokens;
    private readonly SiteOptions _site;
    private readonly ILogger<MembersController> _logger;

    public MembersController(
        IMemberStore members,
        IApplicantStore applicants,
        IAnnouncementService announcements,
        INewsletterStore newsletters,
        ILeadsWebhookService webhook,
        IEmailService email,
        IPasswordResetTokenStore resetTokens,
        IOptions<SiteOptions> site,
        ILogger<MembersController> logger)
    {
        _members = members;
        _applicants = applicants;
        _announcements = announcements;
        _newsletters = newsletters;
        _webhook = webhook;
        _email = email;
        _resetTokens = resetTokens;
        _site = site.Value;
        _logger = logger;
    }

    private async Task<Member?> CurrentMemberAsync(CancellationToken ct)
    {
        var principal = HttpContext.GetMember();
        if (principal is null) return null;
        return await _members.GetByIdAsync(principal.MemberId, ct);
    }

    private string ShareUrl(string referralCode) =>
        $"{_site.Url.TrimEnd('/')}/waitlist?ref={Uri.EscapeDataString(referralCode)}";

    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        var member = await CurrentMemberAsync(ct);
        if (member is null) return Unauthorized(new { message = "Member not found." });
        return Ok(MemberDto.From(member));
    }

    [HttpPut("me")]
    public async Task<IActionResult> UpdateMe([FromBody] UpdateProfileRequest body, CancellationToken ct)
    {
        var member = await CurrentMemberAsync(ct);
        if (member is null) return Unauthorized(new { message = "Member not found." });

        if (body.FirstName is not null) member.FirstName = body.FirstName.Trim();
        if (body.LastName is not null) member.LastName = body.LastName.Trim();
        if (body.Phone is not null) member.Phone = body.Phone.Trim();
        if (body.City is not null) member.City = body.City.Trim();
        if (body.Country is not null) member.Country = body.Country.Trim();
        if (body.PreferredLanguage is not null)
        {
            var lang = body.PreferredLanguage.Trim().ToLowerInvariant();
            member.PreferredLanguage = lang == "en" ? "en" : "fr";
        }
        member.UpdatedAt = DateTime.UtcNow.ToString("o");

        await _members.UpsertAsync(member, ct);
        return Ok(MemberDto.From(member));
    }

    [HttpPost("me/change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest body, CancellationToken ct)
    {
        var member = await CurrentMemberAsync(ct);
        if (member is null) return Unauthorized(new { message = "Member not found." });

        var newPassword = body.NewPassword ?? "";
        if (newPassword.Length < 8)
        {
            return BadRequest(new { message = "Your new password must be at least 8 characters." });
        }

        // If the member is not in the forced-reset state, require the current
        // password to authorize the change.
        if (!member.MustChangePassword)
        {
            if (string.IsNullOrEmpty(body.CurrentPassword) || !PasswordHasher.Verify(body.CurrentPassword, member.PasswordHash))
            {
                return BadRequest(new { message = "Your current password is incorrect." });
            }
        }

        member.PasswordHash = PasswordHasher.Hash(newPassword);
        member.MustChangePassword = false;
        // Invalidate every session issued before this change.
        member.PasswordVersion = unchecked(member.PasswordVersion + 1);
        member.UpdatedAt = DateTime.UtcNow.ToString("o");
        await _members.UpsertAsync(member, ct);

        // Any password change invalidates all outstanding reset tokens for
        // this member — a leaked email link can no longer take over the
        // account after the owner has knowingly rotated their password.
        try
        {
            await _resetTokens.InvalidateAllForMemberAsync(member.Id, "password_changed", ct, "member");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to invalidate reset tokens for {MemberId} after password change", member.Id);
        }

        // Best-effort confirmation email; never fail the change if email is down.
        try
        {
            await _email.SendPasswordChangedAsync(member, member.PreferredLanguage, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Password-changed confirmation email failed for {Email}", member.Email);
        }

        return Ok(MemberDto.From(member));
    }

    [HttpGet("me/referrals")]
    public async Task<IActionResult> MyReferrals(CancellationToken ct)
    {
        var member = await CurrentMemberAsync(ct);
        if (member is null) return Unauthorized(new { message = "Member not found." });

        var applicants = await _applicants.ListByReferrerAsync(member.Id, ct);
        return Ok(new MemberReferralsResponse
        {
            Applicants = applicants.Select(ApplicantDto.From).ToList(),
            ReferralCode = member.ReferralCode,
            ShareUrl = ShareUrl(member.ReferralCode),
            Total = applicants.Count,
            Pending = applicants.Count(a => a.Status is "pending" or "reviewing"),
            Accepted = applicants.Count(a => a.Status == "accepted"),
            BonusPoints = member.BonusPoints,
        });
    }

    [HttpPost("me/referrals")]
    public async Task<IActionResult> CreateReferral([FromBody] ReferralRequest body, CancellationToken ct)
    {
        var member = await CurrentMemberAsync(ct);
        if (member is null) return Unauthorized(new { message = "Member not found." });

        var firstName = body.FirstName?.Trim() ?? "";
        var lastName = body.LastName?.Trim() ?? "";
        var email = body.Email?.Trim() ?? "";
        var phone = body.Phone?.Trim() ?? "";

        if (string.IsNullOrEmpty(firstName) || string.IsNullOrEmpty(lastName))
        {
            return BadRequest(new { message = "First and last name are required." });
        }
        if (string.IsNullOrEmpty(email) && string.IsNullOrEmpty(phone))
        {
            return BadRequest(new { message = "Provide at least an email or a phone number." });
        }

        // Prevent the same person being referred twice by this member.
        if (!string.IsNullOrEmpty(email))
        {
            var existing = await _applicants.ListByReferrerAsync(member.Id, ct);
            if (existing.Any(a => string.Equals(a.Email, email, StringComparison.OrdinalIgnoreCase)))
            {
                return Conflict(new { message = "You have already referred this person." });
            }
        }

        var now = DateTime.UtcNow;
        var applicant = new Applicant
        {
            Id = $"{now.ToUnixTimeMillisecondsSafe()}-{Guid.NewGuid()}",
            FirstName = firstName,
            LastName = lastName,
            Email = email,
            Phone = phone,
            City = body.City?.Trim() ?? "",
            Message = body.Message?.Trim() ?? "",
            ReferralCode = member.ReferralCode,
            ApplicationCode = PasswordHasher.GenerateApplicationCode(),
            ReferrerMemberId = member.Id,
            ReferrerName = $"{member.FirstName} {member.LastName}".Trim(),
            ReferrerEmail = member.Email,
            Status = "pending",
            PreferredLanguage = string.Equals(body.Language, "en", StringComparison.OrdinalIgnoreCase) ? "en" : "fr",
            CreatedAt = now.ToString("o"),
            UpdatedAt = now.ToString("o"),
        };

        await _applicants.AddAsync(applicant, ct);

        member.ReferralCount += 1;
        member.UpdatedAt = now.ToString("o");
        await _members.UpsertAsync(member, ct);

        // Push the referred person to the CRM (Cadence) as a lead, tagged with
        // the source and who referred them. Best-effort — a webhook failure must
        // not fail the member's referral submission.
        try
        {
            var referrerName = $"{member.FirstName} {member.LastName}".Trim();
            var lead = new LeadPayload(
                Name: $"{firstName} {lastName}".Trim(),
                Email: email,
                Phone: phone,
                CompanyName: "",
                Source: "Referral from pavillon46.ch",
                ReferredBy: referrerName,
                ReferrerEmail: member.Email);
            await _webhook.PostLeadAsync(lead, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Referral lead webhook failed for applicant {Id}", applicant.Id);
        }

        return Ok(new ReferralResponse
        {
            Applicant = ApplicantDto.From(applicant),
            ReferralCode = member.ReferralCode,
            ApplicationCode = applicant.ApplicationCode,
            ShareUrl = ShareUrl(member.ReferralCode),
        });
    }

    [HttpGet("events")]
    public async Task<IActionResult> Events([FromQuery] string? lang, CancellationToken ct)
    {
        var resolved = string.IsNullOrEmpty(lang) ? "fr" : lang;
        var announcements = await _announcements.GetForLanguageAsync(resolved, ct);
        return Ok(new { announcements });
    }

    /// <summary>
    /// Member-facing feed of published (and sent) newsletters. Sorted by
    /// PublishedAt descending; title/body pre-localized based on the
    /// <c>lang</c> query param (defaults to FR when missing).
    /// </summary>
    [HttpGet("newsletters")]
    public async Task<IActionResult> ListNewsletters([FromQuery] string? lang, CancellationToken ct)
    {
        var isEn = string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase);
        var all = await _newsletters.ListAsync(ct);

        var newsletters = all
            .Where(n =>
                string.Equals(n.Status, "published", StringComparison.OrdinalIgnoreCase)
                || string.Equals(n.Status, "sent", StringComparison.OrdinalIgnoreCase))
            .Where(n => !string.IsNullOrWhiteSpace(n.PublishedAt))
            .OrderByDescending(n => n.PublishedAt, StringComparer.Ordinal)
            .Select(n => new MemberNewsletterDto
            {
                Id = n.Id,
                Date = (n.PublishedAt ?? "").Length >= 10 ? (n.PublishedAt ?? "")[..10] : (n.PublishedAt ?? ""),
                Tag = n.Tag,
                Title = isEn ? (string.IsNullOrWhiteSpace(n.TitleEn) ? n.TitleFr : n.TitleEn) : n.TitleFr,
                Body = isEn ? (string.IsNullOrWhiteSpace(n.BodyEn) ? n.BodyFr : n.BodyEn) : n.BodyFr,
                CoverImageUrl = n.CoverImageUrl,
            })
            .ToList();

        return Ok(new { newsletters });
    }

    [HttpPost("newsletters/opt-out")]
    public async Task<IActionResult> OptOutNewsletters(CancellationToken ct)
    {
        var member = await CurrentMemberAsync(ct);
        if (member is null) return Unauthorized(new { message = "Member not found." });

        if (!member.NewsletterOptOut)
        {
            member.NewsletterOptOut = true;
            member.UpdatedAt = DateTime.UtcNow.ToString("o");
            await _members.UpsertAsync(member, ct);
        }
        return NoContent();
    }

    [HttpPost("newsletters/opt-in")]
    public async Task<IActionResult> OptInNewsletters(CancellationToken ct)
    {
        var member = await CurrentMemberAsync(ct);
        if (member is null) return Unauthorized(new { message = "Member not found." });

        if (member.NewsletterOptOut)
        {
            member.NewsletterOptOut = false;
            member.UpdatedAt = DateTime.UtcNow.ToString("o");
            await _members.UpsertAsync(member, ct);
        }
        return NoContent();
    }
}

internal static class DateTimeUnixExtensions
{
    public static long ToUnixTimeMillisecondsSafe(this DateTime dt) =>
        new DateTimeOffset(DateTime.SpecifyKind(dt, DateTimeKind.Utc)).ToUnixTimeMilliseconds();
}
