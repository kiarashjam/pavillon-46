using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;
using Pavillon46.Api.Security;

namespace Pavillon46.Api.Services;

/// <summary>
/// Who referred whom, as the portal keeps it: an <see cref="Applicant"/> row naming the referring
/// member, which the member sees under their referrals and the admin console under Referrals, and
/// counts that are kept on the referrer (referrals, accepted referrals, bonus points).
/// </summary>
public interface IReferralLedger
{
    /// <summary>
    /// A friend who used a member's code on the public form: recorded as that member's pending
    /// referral, once per person and referrer.
    /// </summary>
    Task RecordPendingAsync(Member referrer, string firstName, string lastName, string email, string phone, string language, CancellationToken ct = default);

    /// <summary>
    /// The member joined: CadenceE welcomed them, or said afterwards who referred them. Their
    /// referral (one already recorded here, else one made for the referrer the CRM names) is
    /// accepted, and its referrer rewarded once. A referrer recorded here first is kept.
    /// Returns whether a referral was credited or found already credited.
    /// </summary>
    Task<bool> CreditJoinAsync(Member member, CadenceReferrer? referrer, CancellationToken ct = default);
}

public sealed class ReferralLedger : IReferralLedger
{
    // One credit at a time: two deliveries of the same handoff must not reward twice.
    private static readonly SemaphoreSlim Gate = new(1, 1);

    private readonly IMemberStore _members;
    private readonly IApplicantStore _applicants;
    private readonly AuthOptions _auth;
    private readonly ILogger<ReferralLedger> _logger;

    public ReferralLedger(IMemberStore members, IApplicantStore applicants, IOptions<AuthOptions> auth, ILogger<ReferralLedger> logger)
    {
        _members = members;
        _applicants = applicants;
        _auth = auth.Value;
        _logger = logger;
    }

    public async Task RecordPendingAsync(Member referrer, string firstName, string lastName, string email, string phone, string language, CancellationToken ct = default)
    {
        email = email.Trim();
        if (email.Length == 0 || Same(email, referrer.Email)) return;
        await Gate.WaitAsync(ct);
        try
        {
            var all = await _applicants.ListAsync(ct);
            if (all.Any(a => Same(a.Email, email) && a.ReferrerMemberId == referrer.Id)) return;
            var now = DateTime.UtcNow.ToString("o");
            await _applicants.AddAsync(New(referrer, firstName, lastName, email, phone, language, "pending", now), ct);
            referrer.ReferralCount += 1;
            referrer.UpdatedAt = now;
            await _members.UpsertAsync(referrer, ct);
            _logger.LogInformation("referral.pending referrer={ReferrerId}", referrer.Id);
        }
        finally
        {
            Gate.Release();
        }
    }

    public async Task<bool> CreditJoinAsync(Member member, CadenceReferrer? referrer, CancellationToken ct = default)
    {
        await Gate.WaitAsync(ct);
        try
        {
            var by = await ResolveAsync(referrer, ct);
            if (by != null && by.Id == member.Id) by = null;

            var all = await _applicants.ListAsync(ct);
            var mine = all.Where(a => Same(a.Email, member.Email)).ToList();
            var applicant = mine.FirstOrDefault(a => by != null && a.ReferrerMemberId == by.Id)
                ?? mine.FirstOrDefault(a => !string.IsNullOrEmpty(a.ReferrerMemberId))
                ?? mine.FirstOrDefault();
            var now = DateTime.UtcNow.ToString("o");

            if (applicant == null)
            {
                if (by == null) return false;
                applicant = New(by, member.FirstName, member.LastName, member.Email, member.Phone, member.PreferredLanguage, "accepted", now);
                applicant.Message = "Referred in CadenceE.";
                by.ReferralCount += 1;
                Reward(applicant, by);
                by.UpdatedAt = now;
                await _members.UpsertAsync(by, ct);
                await _applicants.AddAsync(applicant, ct);
                _logger.LogInformation("referral.credited referrer={ReferrerId} member={MemberId} from=cadence", by.Id, member.Id);
                return true;
            }

            if (string.IsNullOrEmpty(applicant.ReferrerMemberId) && by != null)
            {
                applicant.ReferrerMemberId = by.Id;
                applicant.ReferrerName = $"{by.FirstName} {by.LastName}".Trim();
                applicant.ReferrerEmail = by.Email;
                applicant.ReferralCode = by.ReferralCode;
                by.ReferralCount += 1;
                by.UpdatedAt = now;
                await _members.UpsertAsync(by, ct);
            }
            else if (by != null && applicant.ReferrerMemberId != by.Id)
            {
                _logger.LogInformation("referral.kept applicant={ApplicantId}: referred here by {Kept}, the CRM names {Named}", applicant.Id, applicant.ReferrerMemberId, by.Id);
            }

            if (applicant.Status != "accepted") applicant.Status = "accepted";
            if (!applicant.BonusAwarded && !string.IsNullOrEmpty(applicant.ReferrerMemberId))
            {
                var rewarded = by != null && by.Id == applicant.ReferrerMemberId ? by : await _members.GetByIdAsync(applicant.ReferrerMemberId, ct);
                if (rewarded != null)
                {
                    Reward(applicant, rewarded);
                    rewarded.UpdatedAt = now;
                    await _members.UpsertAsync(rewarded, ct);
                    _logger.LogInformation("referral.credited referrer={ReferrerId} member={MemberId}", rewarded.Id, member.Id);
                }
            }
            applicant.UpdatedAt = now;
            await _applicants.UpsertAsync(applicant, ct);
            return !string.IsNullOrEmpty(applicant.ReferrerMemberId);
        }
        finally
        {
            Gate.Release();
        }
    }

    /// <summary>The referring member: by their code, else by their email.</summary>
    private async Task<Member?> ResolveAsync(CadenceReferrer? referrer, CancellationToken ct)
    {
        if (referrer == null) return null;
        if (!string.IsNullOrWhiteSpace(referrer.ReferralCode)
            && await _members.GetByReferralCodeAsync(referrer.ReferralCode.Trim(), ct) is { } byCode)
            return byCode;
        return string.IsNullOrWhiteSpace(referrer.Email) ? null : await _members.GetByEmailAsync(referrer.Email.Trim(), ct);
    }

    private void Reward(Applicant applicant, Member referrer)
    {
        referrer.SuccessfulReferrals += 1;
        referrer.BonusPoints += _auth.ReferralBonusPoints;
        applicant.BonusAwarded = true;
    }

    private static Applicant New(Member referrer, string firstName, string lastName, string email, string phone, string language, string status, string now) => new()
    {
        Id = Guid.NewGuid().ToString("N"),
        FirstName = firstName.Trim(),
        LastName = lastName.Trim(),
        Email = email.Trim(),
        Phone = phone.Trim(),
        ReferralCode = referrer.ReferralCode,
        ApplicationCode = PasswordHasher.GenerateApplicationCode(),
        ReferrerMemberId = referrer.Id,
        ReferrerName = $"{referrer.FirstName} {referrer.LastName}".Trim(),
        ReferrerEmail = referrer.Email,
        Status = status,
        PreferredLanguage = string.Equals(language, "en", StringComparison.OrdinalIgnoreCase) ? "en" : "fr",
        CreatedAt = now,
        UpdatedAt = now,
    };

    private static bool Same(string? a, string? b) =>
        string.Equals(a?.Trim(), b?.Trim(), StringComparison.OrdinalIgnoreCase);
}
