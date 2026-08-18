namespace Pavillon46.Api.Models;

public class SendGridOptions
{
    public string ApiKey { get; set; } = "";
    public string FromEmail { get; set; } = "";
    public string FromName { get; set; } = "Pavillon 46";
    public string AdminEmail { get; set; } = "";
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
