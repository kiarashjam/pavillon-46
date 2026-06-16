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
}

public class SiteOptions
{
    public string Url { get; set; } = "https://pavillon46.ch";
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

    // The first admin account is seeded on startup if no admin exists yet.
    // AdminSeedPassword is optional: when blank a strong temporary password is
    // generated and written to the logs once. Either way the seeded admin must
    // change the password on first login.
    public string AdminSeedEmail { get; set; } = "kia@bonapp.group";
    public string AdminSeedPassword { get; set; } = "";

    // Bonus points granted to the referrer when one of their referrals is
    // accepted as a member.
    public int ReferralBonusPoints { get; set; } = 100;

    // Where to store the JSONL fallback files when Azure Storage is not
    // configured. Empty => ~/.pavillon46/.
    public string FilePath { get; set; } = "";
    public bool DisableFileStorage { get; set; }
}
