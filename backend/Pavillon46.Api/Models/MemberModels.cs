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
    // Bumped every time PasswordHash changes (reset, admin reset, self-change).
    // Embedded in issued auth tokens as `pv`; a token whose pv doesn't match the
    // current row is rejected by MemberAuthorizeFilter, so a password change
    // logs out every existing session.
    public int PasswordVersion { get; set; }
    public string CreatedAt { get; set; } = "";
    public string UpdatedAt { get; set; } = "";
    public string LastLoginAt { get; set; } = "";
}

// A single-use, short-lived credential issued when a member asks to reset their
// password. Stored hash-only — the raw token never touches disk. Multiple rows
// may exist per member but at most one is ever "live" (see PasswordResetTokenStore).
public class PasswordResetToken
{
    // Same value as TokenHash. JsonTableStore<T> uses this as the RowKey.
    public string Id { get; set; } = "";
    // Hex-lowercase SHA-256 of the raw base64url token. Canonical case.
    public string TokenHash { get; set; } = "";
    // Subject id: Member.Id or Admin.Id, depending on Audience. Case-preserved.
    public string MemberId { get; set; } = "";
    // "member" (default, including legacy rows) or "admin". Prevents a token
    // issued for one identity from being redeemed against the other store.
    public string Audience { get; set; } = "member";
    // Snapshot of the subject's email at issuance time (lowercased). Useful for
    // audit context when the account later changes email.
    public string Email { get; set; } = "";
    // ISO-8601 UTC.
    public string CreatedAtUtc { get; set; } = "";
    public string ExpiresAtUtc { get; set; } = "";
    // ISO-8601 UTC when the token was burned; null while live.
    public string? UsedAtUtc { get; set; }
    // "consumed" | "superseded" | "password_changed" | "brute_force" | null.
    public string? UsedReason { get; set; }
    // Salted-hash of the requesting IP (see ActivityController.HashIp pattern).
    public string? RequestIp { get; set; }
    // Truncated to 200 chars.
    public string? RequestUserAgent { get; set; }

    public bool IsAdminAudience() =>
        string.Equals(Audience, "admin", StringComparison.OrdinalIgnoreCase);
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

public record ForgotPasswordRequest(string? Email);

public record ResetPasswordRequest(string? Token, string? NewPassword);

public record UpdateMemberRequest(
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
    string? Status
);

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
    // Copied from the token payload. The filter compares this against
    // Member.PasswordVersion to reject tokens issued before the current
    // password. 0 = pre-versioning token, which matches a member that has
    // never had their password changed since the feature landed.
    public int PasswordVersion { get; set; }

    [JsonIgnore]
    public bool IsAdmin => string.Equals(Role, "admin", StringComparison.OrdinalIgnoreCase);
}

// ---------------------------------------------------------------------------
// Admin accounts — a separate identity from members. Admins manage members,
// referrals and analytics; they never appear in the member list and cannot use
// the member dashboard. They reuse the same PBKDF2 hashing + signed-token +
// forced-first-login-reset machinery as members.
// ---------------------------------------------------------------------------

public class Admin
{
    public string Id { get; set; } = "";
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Title { get; set; } = "";
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string Role { get; set; } = "admin";
    public string Status { get; set; } = "active";
    // Temporary password set at seed/reset time → force a change on first login.
    public bool MustChangePassword { get; set; }
    // Bumped on every password change. Embedded in admin tokens as `pv` so a
    // reset logs out every existing admin session (same as Member.PasswordVersion).
    public int PasswordVersion { get; set; }
    public string CreatedAt { get; set; } = "";
    public string UpdatedAt { get; set; } = "";
    public string LastLoginAt { get; set; } = "";
}

public class AdminDto
{
    public string Id { get; set; } = "";
    public string Email { get; set; } = "";
    public string Title { get; set; } = "";
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string Role { get; set; } = "admin";
    public bool MustChangePassword { get; set; }
    public string CreatedAt { get; set; } = "";
    public string LastLoginAt { get; set; } = "";

    public static AdminDto From(Admin a) => new()
    {
        Id = a.Id,
        Email = a.Email,
        Title = a.Title,
        FirstName = a.FirstName,
        LastName = a.LastName,
        Role = a.Role,
        MustChangePassword = a.MustChangePassword,
        CreatedAt = a.CreatedAt,
        LastLoginAt = a.LastLoginAt,
    };
}

public class AdminLoginResponse
{
    public string Token { get; set; } = "";
    public string ExpiresAt { get; set; } = "";
    public AdminDto Admin { get; set; } = new();
}
