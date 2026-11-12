using System.Globalization;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Localization;
using Pavillon46.Api.Models;
using Pavillon46.Api.Security;

namespace Pavillon46.Api.Services;

public interface ICadenceOnboardingService
{
    /// <summary>
    /// Opens (or finds) the member a CadenceE handoff names, sends their welcome
    /// email, and queues the reports back to the CRM. The caller has already
    /// checked the signature. Returns the HTTP status and body to answer.
    /// </summary>
    Task<(int Status, object Body)> HandleOnboardingAsync(string eventId, CadenceOnboardingPayload payload, CancellationToken ct = default);
}

/// <summary>
/// The member side of a CadenceE handoff: when a deal is won in the CRM, the new
/// member gets an account here and a welcome email with a link to choose their
/// password. No password is ever made up for them or sent to them.
/// </summary>
/// <remarks>
/// <para>
/// Handoffs are processed one at a time (<see cref="_gate"/>): they are rare,
/// and one at a time a retry of an event always finds the first one's record,
/// and two handoffs for one address cannot both create a member.
/// </para>
/// <para>
/// The event is recorded before the email is sent. A crash between the two
/// leaves a member without their email, which the CRM's team sees (no
/// "email sent" report) and resends; recording after would risk the opposite,
/// two welcome emails, on any retry.
/// </para>
/// </remarks>
public sealed class CadenceOnboardingService : ICadenceOnboardingService
{
    internal const int MaxMessage = 4000;
    internal const int MaxHtml = 1_000_000;
    internal const int MaxSubject = 300;

    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly IMemberStore _members;
    private readonly IPasswordResetTokenStore _resetTokens;
    private readonly ICadenceEventStore _events;
    private readonly ICadenceReporter _reporter;
    private readonly IEmailService _email;
    private readonly CadenceOptions _options;
    private readonly SiteOptions _site;
    private readonly ILogger<CadenceOnboardingService> _logger;

    public CadenceOnboardingService(
        IMemberStore members,
        IPasswordResetTokenStore resetTokens,
        ICadenceEventStore events,
        ICadenceReporter reporter,
        IEmailService email,
        IOptions<CadenceOptions> options,
        IOptions<SiteOptions> site,
        ILogger<CadenceOnboardingService> logger)
    {
        _members = members;
        _resetTokens = resetTokens;
        _events = events;
        _reporter = reporter;
        _email = email;
        _options = options.Value;
        _site = site.Value;
        _logger = logger;
    }

    public async Task<(int Status, object Body)> HandleOnboardingAsync(string eventId, CadenceOnboardingPayload payload, CancellationToken ct = default)
    {
        if (!await _gate.WaitAsync(TimeSpan.FromSeconds(20), ct))
        {
            // The CRM retries anything that is not a 2xx, so this is not lost.
            return (503, new { message = "Busy with another handoff. Try again shortly.", errorType = "busy" });
        }
        try
        {
            return await HandleAsync(eventId.Trim(), payload, ct);
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<(int Status, object Body)> HandleAsync(string eventId, CadenceOnboardingPayload p, CancellationToken ct)
    {
        var seen = await _events.GetAsync(eventId, ct);
        if (seen is not null)
        {
            _logger.LogInformation("cadence.onboarding.repeat event={EventId} memberId={MemberId}", eventId, seen.AccountId);
            return (200, new CadenceHandoffResponse { AccountId = seen.AccountId, Status = seen.Status });
        }

        var now = DateTime.UtcNow;
        var callbackUrl = p.Callback?.Url?.Trim() ?? "";
        var callbackToken = p.Callback?.Token?.Trim() ?? "";
        var hasCallback = callbackUrl.Length > 0 || callbackToken.Length > 0;
        if (hasCallback && (!_reporter.IsAllowedCallback(callbackUrl) || callbackToken.Length is 0 or > 200))
        {
            // Reports carry a credential for this handoff; it never goes out
            // over plain http outside Development.
            return (400, new { message = "The callback address must be https, with a token.", errorType = "callback_not_https" });
        }

        var onboardingId = p.OnboardingId?.Trim() ?? "";
        if (Problem(eventId, onboardingId, p) is { } problem)
        {
            _logger.LogWarning("cadence.onboarding.rejected event={EventId} reason={Reason}", eventId, problem);
            if (!hasCallback) return (400, new { message = problem, errorType = "invalid_handoff" });
            // Answered 200 so the CRM stops retrying a handoff that will never
            // be valid, and told why through the report its team sees.
            await _events.SaveAsync(new CadenceEventRecord
            {
                Id = eventId, OnboardingId = onboardingId, Status = "rejected", ReceivedAtUtc = now.ToString("o"),
            }, ct);
            _reporter.Enqueue(callbackUrl, callbackToken, new[] { new CadenceReport("failed", "", problem, now) });
            return (200, new CadenceHandoffResponse { Status = "rejected", Message = problem });
        }

        var contact = p.Contact!;
        var email = contact.Email!.Trim();
        var language = EmailTranslations.NormalizeLang(p.Language);
        var startDate = (p.Membership?.StartsOn ?? "").Trim();

        var member = await _members.GetByEmailAsync(email, ct);
        var status = member is null ? "created" : "existing";
        if (member is null)
        {
            var (first, last) = Names(contact, email);
            member = new Member
            {
                Id = Guid.NewGuid().ToString("N"),
                Email = email,
                // A random secret nobody knows, so the account has no usable
                // password until the member chooses one through the welcome link.
                PasswordHash = PasswordHasher.Hash(ResetTokenGenerator.GenerateRaw()),
                FirstName = first,
                LastName = last,
                Phone = Clip(contact.Phone, 64),
                Role = "member",
                Status = "active",
                ReferralCode = await UniqueReferralCodeAsync(ct),
                PreferredLanguage = language,
                MustChangePassword = false,
                Source = "cadence",
                CreatedAt = now.ToString("o"),
            };
        }
        else if (!string.Equals(member.Status, "active", StringComparison.OrdinalIgnoreCase))
        {
            // A suspended or inactive account is an admin's decision here; a won
            // deal elsewhere does not undo it.
            var why = $"This person's account on the portal is {member.Status}. An admin must reactivate it before they can be welcomed.";
            _logger.LogWarning("cadence.onboarding.inactive_member event={EventId} memberId={MemberId}", eventId, member.Id);
            await _events.SaveAsync(new CadenceEventRecord
            {
                Id = eventId, OnboardingId = onboardingId, AccountId = member.Id, Status = status, ReceivedAtUtc = now.ToString("o"),
            }, ct);
            if (hasCallback)
            {
                _reporter.Enqueue(callbackUrl, callbackToken, new[]
                {
                    new CadenceReport("account_existing", member.Id, null, now),
                    new CadenceReport("failed", member.Id, why, now),
                });
            }
            return (200, new CadenceHandoffResponse { AccountId = member.Id, Status = status, Message = why });
        }

        member.MembershipStartDate = startDate;
        member.MembershipStartUndetermined = startDate.Length == 0;
        // A new handoff is a new story: its password_set has not been reported.
        if (!string.Equals(member.CrmOnboardingId, onboardingId, StringComparison.OrdinalIgnoreCase))
            member.CrmPasswordSetReported = false;
        member.CrmOnboardingId = onboardingId;
        member.CrmDealId = Clip(p.Deal?.Id, 100);
        member.CrmCallbackUrl = hasCallback ? callbackUrl : "";
        member.CrmCallbackToken = hasCallback ? callbackToken : "";
        member.UpdatedAt = now.ToString("o");
        await _members.UpsertAsync(member, ct);

        await _events.SaveAsync(new CadenceEventRecord
        {
            Id = eventId, OnboardingId = onboardingId, AccountId = member.Id, Status = status, ReceivedAtUtc = now.ToString("o"),
        }, ct);
        _logger.LogInformation("cadence.onboarding.account event={EventId} memberId={MemberId} status={Status}", eventId, member.Id, status);

        var reports = new List<CadenceReport>
        {
            new(status == "created" ? "account_created" : "account_existing", member.Id, null, now),
        };

        try
        {
            var (link, expiresAt) = await IssueWelcomeLinkAsync(member, ct);
            var sender = await _email.SendCadenceWelcomeAsync(member, new CadenceWelcome(
                language,
                Clip(p.Email?.Subject, MaxSubject),
                p.Email?.Html,
                Clip(p.WelcomeMessage, MaxMessage),
                member.MembershipStartDate,
                member.MembershipStartUndetermined,
                link,
                expiresAt,
                p.From), CancellationToken.None);
            reports.Add(new CadenceReport("email_sent", member.Id, SentFrom(sender), DateTime.UtcNow));
            _logger.LogInformation("cadence.onboarding.email_sent event={EventId} memberId={MemberId}", eventId, member.Id);
        }
        catch (Exception ex)
        {
            // The reason the CRM's team reads: ours, never the exception's text.
            var why = _email.IsConfigured
                ? "The mail service did not accept the welcome email."
                : "Email is not configured on the portal yet, so no welcome email was sent.";
            reports.Add(new CadenceReport("email_failed", member.Id, why, DateTime.UtcNow));
            _logger.LogWarning(ex, "cadence.onboarding.email_failed event={EventId} memberId={MemberId}", eventId, member.Id);
        }

        if (hasCallback) _reporter.Enqueue(callbackUrl, callbackToken, reports);
        return (200, new CadenceHandoffResponse { AccountId = member.Id, Status = status });
    }

    /// <summary>
    /// A set-password link through the password-reset machinery, so it is
    /// single-use, stored only as a hash, and burned like any reset link; it
    /// just lives longer (WelcomeLinkTtlHours). Older links for the member stop working.
    /// </summary>
    private async Task<(string Link, DateTime ExpiresAt)> IssueWelcomeLinkAsync(Member member, CancellationToken ct)
    {
        await _resetTokens.InvalidateAllForMemberAsync(member.Id, "superseded", ct, "member");
        var raw = ResetTokenGenerator.GenerateRaw();
        var hash = ResetTokenGenerator.Hash(raw);
        var now = DateTime.UtcNow;
        var expiresAt = now.AddHours(Math.Clamp(_options.WelcomeLinkTtlHours, 1, 24 * 30));
        await _resetTokens.UpsertAsync(new PasswordResetToken
        {
            Id = hash,
            TokenHash = hash,
            MemberId = member.Id,
            Audience = "member",
            Email = member.Email.Trim().ToLowerInvariant(),
            CreatedAtUtc = now.ToString("o"),
            ExpiresAtUtc = expiresAt.ToString("o"),
            RequestUserAgent = "cadence-onboarding",
        }, ct);
        return (_site.Page($"reset-password?token={Uri.EscapeDataString(raw)}&welcome=1"), expiresAt);
    }

    /// <summary>Why the handoff cannot be processed, or null.</summary>
    // What the CRM's team reads on the deal: who it went out from, and why not
    // from the address they asked for, when it was not.
    private static string SentFrom(CadenceSender s)
    {
        var line = $"Sent from {s.Name} <{s.Email}>";
        if (s.ReplyTo is not null) line += $", replies to {s.ReplyTo}";
        if (s.RequestedEmail is not null)
            line += $". {s.RequestedEmail} is not on the portal's sending domain, so it went from the portal's own address";
        return line + ".";
    }

    private static string? Problem(string eventId, string onboardingId, CadenceOnboardingPayload p)
    {
        if (eventId.Length is 0 or > 100) return "The event has no usable id.";
        if (p.Version != 1) return $"Handoff version {p.Version} is not supported; this portal reads version 1.";
        if (onboardingId.Length is 0 or > 100) return "The handoff has no onboarding id.";
        var email = p.Contact?.Email?.Trim() ?? "";
        if (!LooksLikeEmail(email) || email.Length > 254) return "The contact has no valid email address.";
        var start = p.Membership?.StartsOn?.Trim() ?? "";
        if (start.Length > 0
            && (!DateTime.TryParseExact(start, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
                || date.Year is < 2000 or > 2100))
            return "The membership start date is not a date (yyyy-MM-dd).";
        if ((p.WelcomeMessage?.Length ?? 0) > MaxMessage) return $"The welcome message is longer than {MaxMessage} characters.";
        if ((p.Email?.Html?.Length ?? 0) > MaxHtml) return "The welcome email's HTML is too large.";
        return null;
    }

    private static (string First, string Last) Names(CadenceContact contact, string email)
    {
        var first = (contact.FirstName ?? "").Trim();
        var last = (contact.LastName ?? "").Trim();
        if (first.Length == 0 && last.Length == 0)
        {
            var full = (contact.Name ?? "").Trim();
            var space = full.IndexOf(' ');
            (first, last) = space < 0 ? (full, "") : (full[..space], full[(space + 1)..].Trim());
        }
        // A member always has a name to greet them by.
        if (first.Length == 0) first = email[..email.IndexOf('@')];
        return (Clip(first, 100), Clip(last, 100));
    }

    private async Task<string> UniqueReferralCodeAsync(CancellationToken ct)
    {
        for (var attempt = 0; attempt < 8; attempt++)
        {
            var code = PasswordHasher.GenerateReferralCode();
            if (await _members.GetByReferralCodeAsync(code, ct) is null) return code;
        }
        return "PAV-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
    }

    private static bool LooksLikeEmail(string s)
    {
        var at = s.IndexOf('@');
        return at > 0 && at < s.Length - 1 && s.IndexOf('@', at + 1) < 0 && !s.Any(char.IsWhiteSpace);
    }

    private static string Clip(string? s, int max)
    {
        var v = (s ?? "").Trim();
        return v.Length <= max ? v : v[..max];
    }
}
