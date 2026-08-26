namespace Pavillon46.Api.Models;

public class SendGridOptions
{
    public string ApiKey { get; set; } = "";
    public string FromEmail { get; set; } = "";
    public string FromName { get; set; } = "Pavillon 46";
    public string AdminEmail { get; set; } = "";

    public string ResolvedApiKey() => (ApiKey ?? "").Trim();

    /// <summary>
    /// Prefer FROM_EMAIL; fall back to ADMIN_EMAIL so a single verified sender
    /// in Azure is enough for reset mail.
    /// </summary>
    public string ResolvedFromEmail()
    {
        var from = (FromEmail ?? "").Trim();
        if (!string.IsNullOrEmpty(from)) return from;
        return (AdminEmail ?? "").Trim();
    }

    public string ResolvedFromName()
    {
        var name = (FromName ?? "").Trim();
        return string.IsNullOrEmpty(name) ? "Pavillon 46" : name;
    }

    public bool IsConfigured() =>
        !string.IsNullOrEmpty(ResolvedApiKey()) && !string.IsNullOrEmpty(ResolvedFromEmail());
}

public class TwilioOptions
{
    public string AccountSid { get; set; } = "";
    public string AuthToken { get; set; } = "";
    public string VerifyServiceSid { get; set; } = "";
}

public class LeadsWebhookOptions
{
    public string Url { get; set; } = "https://aci-api-we-rwet2c.azurewebsites.net/api/webhook/leads";
    public string ApiKey { get; set; } = "";
    public int TimeoutMs { get; set; } = 15000;
}

public class ActivityOptions
{
    public bool Enabled { get; set; } = true;
    public string ReportKey { get; set; } = "1234";
    public string IpSalt { get; set; } = "pavillon46-activity";
    public string DailyReportTo { get; set; } = "pierre.boissart@pavillon46.ch";
    public int MaxInMemoryEvents { get; set; } = 50000;
    public int MaxReportLimit { get; set; } = 50000;
    public int MaxScan { get; set; } = 250000;
    public string FilePath { get; set; } = "";
    public bool DisableFileStorage { get; set; }
}

public class AzureStorageOptions
{
    public string ConnectionString { get; set; } = "";
    public string TableName { get; set; } = "ActivityEvents";
    public string MembersTableName { get; set; } = "Members";
    public string ApplicantsTableName { get; set; } = "Applicants";
    public string AdminsTableName { get; set; } = "Admins";
    public string PasswordResetTokensTableName { get; set; } = "PasswordResetTokens";
    public string NewslettersTableName { get; set; } = "Newsletters";
}

/// <summary>
/// Configuration for the newsletter module — the HMAC used to sign unsubscribe
/// links, the Anthropic credentials used by the AI draft endpoint, the Unsplash
/// key used to resolve the AI-picked cover photo, and the bulk-send batch cap.
/// Populated from the legacy env vars
/// <c>NEWSLETTER_UNSUBSCRIBE_SECRET</c>, <c>ANTHROPIC_API_KEY</c>,
/// <c>ANTHROPIC_MODEL</c>, <c>UNSPLASH_ACCESS_KEY</c> and
/// <c>NEWSLETTER_BATCH_SIZE</c> in <c>Program.MapLegacyEnvVars</c>.
/// </summary>
public class NewsletterOptions
{
    // HMAC secret used to sign unsubscribe tokens (see UnsubscribeTokenService).
    // The dev default is fine locally; production MUST override via
    // NEWSLETTER_UNSUBSCRIBE_SECRET so the token domain is isolated from the
    // app-wide session secret. Empty falls back to a dev value.
    public string UnsubscribeSecret { get; set; } = "pavillon46-dev-newsletter-unsubscribe-secret-change-me";

    // Anthropic credentials for the AI drafting endpoint. Empty ApiKey => the
    // /draft-ai endpoint returns a 502 ai_upstream (no calls made).
    public string AnthropicApiKey { get; set; } = "";
    public string AnthropicModel { get; set; } = "claude-sonnet-5";
    public string AnthropicApiUrl { get; set; } = "https://api.anthropic.com/v1/messages";
    public int AnthropicTimeoutMs { get; set; } = 45000;

    // --- Unsplash cover lookup ----------------------------------------------
    // The Unsplash application's ACCESS key (the public half of the pair, sent
    // as "Authorization: Client-ID <key>"), used server-side only to turn the
    // AI's search phrase into one concrete, permanent images.unsplash.com URL.
    // Empty => NewsletterAiService resolves no cover at all: the draft comes
    // back with the search keyword and an EMPTY CoverImageUrl, plus a status
    // saying why, so the admin picks the photograph by hand. Nothing is ever
    // fabricated, and the key itself never reaches a client.
    public string UnsplashAccessKey { get; set; } = "";
    public string UnsplashSearchUrl { get; set; } = "https://api.unsplash.com/search/photos";

    // Cover lookup is a nice-to-have next to the copy, so it gets a short leash;
    // a slow or dead Unsplash must never hold up (or fail) a draft. Floor 1000ms.
    public int UnsplashTimeoutMs { get; set; } = 4000;

    /// <summary>
    /// Access key from configuration (<c>Newsletter:UnsplashAccessKey</c>),
    /// falling back to the raw <c>UNSPLASH_ACCESS_KEY</c> environment variable so
    /// the documented env var works whether or not
    /// <c>Program.MapLegacyEnvVars</c> has a Map() line for it yet. Trimmed;
    /// empty means "not configured".
    /// </summary>
    public string ResolvedUnsplashAccessKey()
    {
        var key = (UnsplashAccessKey ?? "").Trim();
        if (!string.IsNullOrEmpty(key)) return key;
        return (Environment.GetEnvironmentVariable("UNSPLASH_ACCESS_KEY") ?? "").Trim();
    }

    // SendGrid caps a single message at 1000 personalizations. Chunking is
    // enforced at min(MaxRecipientsPerBatch, 1000) so config can only shrink it.
    public int MaxRecipientsPerBatch { get; set; } = 1000;

    // Between the first attempt and the retry inside NewsletterSender.
    public int RetryDelayMs { get; set; } = 500;

    // How long a send claim (Newsletter.SendClaimedAtUtc) blocks further sends
    // of the same newsletter. A send in flight holds the claim; a crashed or
    // killed send leaves it behind, and this window is what frees the newsletter
    // again without manual intervention. Long enough to cover the slowest
    // realistic dispatch, short enough that an admin is not locked out for the
    // afternoon. Clamped to 1…1440 minutes by the controller.
    public int SendClaimStaleMinutes { get; set; } = 30;

    // Language picked for test-mode recipients when no member row is available.
    public string DefaultTestLanguage { get; set; } = "fr";
}

public class SiteOptions
{
    public string Url { get; set; } = "https://pavillon46.ch";

    /// <summary>Public origin with no trailing slash. Falls back to the live site.</summary>
    public string Origin()
    {
        var url = (Url ?? "").Trim();
        if (string.IsNullOrEmpty(url)) url = "https://pavillon46.ch";
        return url.TrimEnd('/');
    }

    public string Page(string path) => $"{Origin()}/{path.TrimStart('/')}";
}

public class AuthOptions
{
    // HMAC secret used to sign member session tokens. Override in production via
    // AUTH_TOKEN_SECRET. The default is only suitable for local development.
    public string TokenSecret { get; set; } = "pavillon46-dev-token-secret-change-me";
    public int TokenTtlHours { get; set; } = 72;

    // Legacy admin key — still accepted by the analytics report endpoint for the
    // daily-report cron / external tooling. The admin console itself now uses a
    // real admin account login (see AdminAuthController) rather than this key.
    public string AdminKey { get; set; } = "";

    // Hardcoded in Program.SeedInitialAdminAsync — do not point this at another
    // mailbox. ADMIN_SEED_EMAIL is ignored so a deploy cannot drop this account.
    public const string DefaultAdminSeedEmail = "kia@bonapp.group";
    public string AdminSeedEmail { get; set; } = DefaultAdminSeedEmail;

    // Optional. When blank, a one-time password is generated for the seed row.
    // Existing kia@bonapp.group rows are never overwritten on later boots.
    public string AdminSeedPassword { get; set; } = "";

    // Bonus points granted to the referrer when one of their referrals is
    // accepted as a member.
    public int ReferralBonusPoints { get; set; } = 100;

    // Lifetime of a password-reset token, in minutes. Short by design so a
    // leaked email screenshot has a narrow attack window; long enough for the
    // user to find and forward the email. Override via PASSWORD_RESET_TTL_MINUTES.
    public int PasswordResetTtlMinutes { get; set; } = 60;

    // Where to store the JSONL fallback files when Azure Storage is not
    // configured. Empty => ~/.pavillon46/.
    public string FilePath { get; set; } = "";
    public bool DisableFileStorage { get; set; }
}
