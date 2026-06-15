using System.Text.Json.Serialization;

namespace Pavillon46.Api.Models;

// ---------------------------------------------------------------------------
// Domain entities (persisted in Azure Table Storage, with file / in-memory
// fallback — see MemberStore / ApplicantStore). Kept as plain POCOs so they can
// be JSON-serialized for the fallback stores and mapped to/from TableEntity.
// ---------------------------------------------------------------------------

public class Member
{
    public string Id { get; set; } = "";
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Title { get; set; } = "";
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string Phone { get; set; } = "";
    public string City { get; set; } = "";
    public string Country { get; set; } = "";
    public string ContractRef { get; set; } = "";
    public string Notes { get; set; } = "";
    public string Role { get; set; } = "member";
    public string Status { get; set; } = "active";
    public string ReferralCode { get; set; } = "";
    public string PreferredLanguage { get; set; } = "fr";
    public int ReferralCount { get; set; }
    public int SuccessfulReferrals { get; set; }
    public int BonusPoints { get; set; }
    public bool MustChangePassword { get; set; }
    public string CreatedAt { get; set; } = "";
    public string UpdatedAt { get; set; } = "";
    public string LastLoginAt { get; set; } = "";
}

public class Applicant
{
    public string Id { get; set; } = "";
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public string City { get; set; } = "";
    public string Message { get; set; } = "";
    // The personal referral code of the member who referred this applicant.
    public string ReferralCode { get; set; } = "";
    // A unique reference generated per application (shown to the member as proof).
    public string ApplicationCode { get; set; } = "";
    public string ReferrerMemberId { get; set; } = "";
    public string ReferrerName { get; set; } = "";
    public string ReferrerEmail { get; set; } = "";
    public string Status { get; set; } = "pending"; // pending | reviewing | accepted | declined
    public bool BonusAwarded { get; set; }
    public string PreferredLanguage { get; set; } = "fr";
    public string CreatedAt { get; set; } = "";
    public string UpdatedAt { get; set; } = "";
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

public record LoginRequest(string? Email, string? Password);

public record UpdateProfileRequest(
    string? FirstName,
    string? LastName,
    string? Phone,
    string? City,
    string? Country,
    string? PreferredLanguage
);

public record ReferralRequest(
    string? FirstName,
    string? LastName,
    string? Email,
    string? Phone,
    string? City,
    string? Message,
    string? Language
);

public record CreateMemberRequest(
    string? Title,
    string? FirstName,
    string? LastName,
    string? Email,
    string? Phone,
    string? City,
    string? Country,
    string? ContractRef,
    string? Notes,
    string? Language,
    bool SendEmail
);

public record SendCredentialsRequest(string? MemberId, string? Email, string? Password);

public record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);

public record UpdateApplicantRequest(string? Status);

// ---------------------------------------------------------------------------
// Responses (camelCased by the global JSON options)
// ---------------------------------------------------------------------------

public class MemberDto
{
    public string Id { get; set; } = "";
    public string Email { get; set; } = "";
    public string Title { get; set; } = "";
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string Phone { get; set; } = "";
    public string City { get; set; } = "";
    public string Country { get; set; } = "";
    public string Role { get; set; } = "member";
    public string Status { get; set; } = "active";
    public string ReferralCode { get; set; } = "";
    public string PreferredLanguage { get; set; } = "fr";
    public int ReferralCount { get; set; }
    public int SuccessfulReferrals { get; set; }
    public int BonusPoints { get; set; }
    public bool MustChangePassword { get; set; }
    public string CreatedAt { get; set; } = "";
    public string LastLoginAt { get; set; } = "";

    public static MemberDto From(Member m) => new()
    {
        Id = m.Id,
        Email = m.Email,
        Title = m.Title,
        FirstName = m.FirstName,
        LastName = m.LastName,
        Phone = m.Phone,
        City = m.City,
        Country = m.Country,
        Role = m.Role,
        Status = m.Status,
        ReferralCode = m.ReferralCode,
        PreferredLanguage = m.PreferredLanguage,
        ReferralCount = m.ReferralCount,
        SuccessfulReferrals = m.SuccessfulReferrals,
        BonusPoints = m.BonusPoints,
        MustChangePassword = m.MustChangePassword,
        CreatedAt = m.CreatedAt,
        LastLoginAt = m.LastLoginAt,
    };
}

public class LoginResponse
{
    public string Token { get; set; } = "";
    public string ExpiresAt { get; set; } = "";
    public MemberDto Member { get; set; } = new();
}

public class CreateMemberResponse
{
    public MemberDto Member { get; set; } = new();
    // Plaintext password returned ONCE so the admin can copy it or trigger the
    // credentials email. It is never stored in plaintext.
    public string Password { get; set; } = "";
    public bool EmailSent { get; set; }
    public string? EmailError { get; set; }
}

public class ApplicantDto
{
    public string Id { get; set; } = "";
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public string City { get; set; } = "";
    public string Message { get; set; } = "";
    public string ReferralCode { get; set; } = "";
    public string ApplicationCode { get; set; } = "";
    public string ReferrerMemberId { get; set; } = "";
    public string ReferrerName { get; set; } = "";
    public string ReferrerEmail { get; set; } = "";
    public string Status { get; set; } = "pending";
    public bool BonusAwarded { get; set; }
    public string CreatedAt { get; set; } = "";

    public static ApplicantDto From(Applicant a) => new()
    {
        Id = a.Id,
        FirstName = a.FirstName,
        LastName = a.LastName,
        Email = a.Email,
        Phone = a.Phone,
        City = a.City,
        Message = a.Message,
        ReferralCode = a.ReferralCode,
        ApplicationCode = a.ApplicationCode,
        ReferrerMemberId = a.ReferrerMemberId,
        ReferrerName = a.ReferrerName,
        ReferrerEmail = a.ReferrerEmail,
        Status = a.Status,
        BonusAwarded = a.BonusAwarded,
        CreatedAt = a.CreatedAt,
    };
}

public class ReferralResponse
{
    public ApplicantDto Applicant { get; set; } = new();
    public string ReferralCode { get; set; } = "";
    public string ApplicationCode { get; set; } = "";
    public string ShareUrl { get; set; } = "";
}

public class MemberReferralsResponse
{
    public List<ApplicantDto> Applicants { get; set; } = new();
    public string ReferralCode { get; set; } = "";
    public string ShareUrl { get; set; } = "";
    public int Total { get; set; }
    public int Pending { get; set; }
    public int Accepted { get; set; }
    public int BonusPoints { get; set; }
}

public class MemberAnnouncement
{
    public string Id { get; set; } = "";
    public string Date { get; set; } = "";
    public string Tag { get; set; } = "";
    public string TitleFr { get; set; } = "";
    public string TitleEn { get; set; } = "";
    public string BodyFr { get; set; } = "";
    public string BodyEn { get; set; } = "";
}

public class AnnouncementDto
{
    public string Id { get; set; } = "";
    public string Date { get; set; } = "";
    public string Tag { get; set; } = "";
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
}

// Resolved identity attached to the request by MemberAuthorizeFilter.
public class MemberPrincipal
{
    public string MemberId { get; set; } = "";
    public string Email { get; set; } = "";
    public string Role { get; set; } = "member";

    [JsonIgnore]
    public bool IsAdmin => string.Equals(Role, "admin", StringComparison.OrdinalIgnoreCase);
}
