using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Configuration;
using Pavillon46.Api.Models;
using Pavillon46.Api.Security;
using Pavillon46.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Load repo-root .env / .env.local (same files as the old Next.js app) before
// mapping legacy variable names into IConfiguration.
DotEnvLoader.LoadFromRepositoryRoot();
builder.Configuration.AddEnvironmentVariables();
MapLegacyEnvVars(builder.Configuration);

builder.Services.Configure<SendGridOptions>(builder.Configuration.GetSection("SendGrid"));
builder.Services.Configure<TwilioOptions>(builder.Configuration.GetSection("Twilio"));
builder.Services.Configure<LeadsWebhookOptions>(builder.Configuration.GetSection("LeadsWebhook"));
builder.Services.Configure<ActivityOptions>(builder.Configuration.GetSection("Activity"));
builder.Services.Configure<AzureStorageOptions>(builder.Configuration.GetSection("AzureStorage"));
builder.Services.Configure<SiteOptions>(builder.Configuration.GetSection("Site"));
builder.Services.Configure<AuthOptions>(builder.Configuration.GetSection("Auth"));

builder.Services.AddSingleton<IActivityStore, ActivityStore>();
builder.Services.AddSingleton<IEmailService, EmailService>();
builder.Services.AddSingleton<IVerificationService, VerificationService>();
builder.Services.AddSingleton<IDailyReportService, DailyReportService>();
builder.Services.AddSingleton<IMemberStore, MemberStore>();
builder.Services.AddSingleton<IApplicantStore, ApplicantStore>();
builder.Services.AddSingleton<IAdminStore, AdminStore>();
builder.Services.AddSingleton<IPasswordResetTokenStore, PasswordResetTokenStore>();
builder.Services.AddSingleton<ITokenService, TokenService>();
builder.Services.AddSingleton<IAnnouncementService, AnnouncementService>();
builder.Services.AddSingleton<RateLimiter>(_ => new RateLimiter { MaxEvents = 30, WindowMs = 15_000 });
builder.Services.AddSingleton<KeyedRateLimiter>();
builder.Services.AddHttpClient<ILeadsWebhookService, LeadsWebhookService>();

builder.Services.AddControllers()
    .AddJsonOptions(opts =>
    {
        opts.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        opts.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// The API sits behind a reverse proxy in every non-dev environment (Azure App
// Service, App Gateway, Front Door). ForwardedHeadersMiddleware promotes the
// proxy-set X-Forwarded-For into HttpContext.Connection.RemoteIpAddress so
// rate limiting and audit logging see the real client IP — never the raw,
// caller-supplied header. KnownNetworks/KnownProxies are cleared: we trust
// exactly one hop (ForwardLimit = 1) — the last proxy in front of us — which
// is Azure's managed ingress. Direct callers can't spoof XFF.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.SetIsOriginAllowed(origin =>
              {
                  if (string.IsNullOrWhiteSpace(origin)) return false;
                  if (allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase)) return true;
                  if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;
                  return uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
                      || uri.Host.Equals("pavillon46.ch", StringComparison.OrdinalIgnoreCase)
                      || uri.Host.EndsWith(".pavillon46.ch", StringComparison.OrdinalIgnoreCase)
                      || uri.Host.EndsWith(".azurestaticapps.net", StringComparison.OrdinalIgnoreCase);
              })
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

// MUST run before anything that reads client IP or scheme.
app.UseForwardedHeaders();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseRouting();
app.MapControllers();
app.MapGet("/healthz", () => Results.Ok(new { ok = true }));

var sendgridOpts = app.Services.GetRequiredService<IOptions<SendGridOptions>>().Value;
if (string.IsNullOrWhiteSpace(sendgridOpts.ApiKey) || string.IsNullOrWhiteSpace(sendgridOpts.FromEmail))
{
    app.Logger.LogWarning(
        "SendGrid is not fully configured (SENDGRID_API_KEY / FROM_EMAIL). Waitlist, credentials and password-reset emails will not be delivered.");
}

await SeedInitialAdminAsync(app);

app.Run();

// Seed the first admin account on startup if none exists yet. The seeded admin
// must change its password on first login. The password comes from
// Auth:AdminSeedPassword (ADMIN_SEED_PASSWORD) when set; otherwise a strong
// temporary one is generated and logged once for bootstrapping.
static async Task SeedInitialAdminAsync(WebApplication app)
{
    using var scope = app.Services.CreateScope();
    var sp = scope.ServiceProvider;
    var admins = sp.GetRequiredService<IAdminStore>();
    var auth = sp.GetRequiredService<IOptions<AuthOptions>>().Value;
    var logger = sp.GetRequiredService<ILoggerFactory>().CreateLogger("AdminSeed");

    var seedEmail = (auth.AdminSeedEmail ?? "").Trim().ToLowerInvariant();
    if (string.IsNullOrEmpty(seedEmail)) return;

    try
    {
        if (await admins.GetByEmailAsync(seedEmail) is not null) return;

        var generated = string.IsNullOrEmpty(auth.AdminSeedPassword);

        // In production, never auto-generate a log-only password: it would either
        // leak a credential into telemetry or leave an admin nobody can sign in
        // as. Require an explicit ADMIN_SEED_PASSWORD instead — fail loud.
        if (generated && !app.Environment.IsDevelopment())
        {
            logger.LogWarning(
                "No initial admin created for {Email}: set ADMIN_SEED_PASSWORD to seed the admin account, then restart.",
                seedEmail);
            return;
        }

        var password = generated ? PasswordHasher.GeneratePassword() : auth.AdminSeedPassword;
        var now = DateTime.UtcNow.ToString("o");

        // Deterministic id from the normalized email so that if several instances
        // cold-boot at once they converge on a single row, rather than creating
        // duplicate admins with different password hashes (which breaks login).
        var id = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes("admin:" + seedEmail)))
            .ToLowerInvariant()[..32];

        await admins.UpsertAsync(new Admin
        {
            Id = id,
            Email = seedEmail,
            PasswordHash = PasswordHasher.Hash(password),
            FirstName = "Admin",
            Role = "admin",
            Status = "active",
            MustChangePassword = true,
            CreatedAt = now,
            UpdatedAt = now,
        });

        // Only ever write the cleartext temporary password to logs in Development.
        if (generated)
            logger.LogWarning(
                "Seeded initial admin {Email} with a generated temporary password (Development only): {Password} — change it on first login.",
                seedEmail, password);
        else
            logger.LogInformation(
                "Seeded initial admin {Email} from configured seed password — change it on first login.",
                seedEmail);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Failed to seed the initial admin account.");
    }
}

static void MapLegacyEnvVars(IConfigurationManager config)
{
    void Map(string envName, string key)
    {
        var value = Environment.GetEnvironmentVariable(envName);
        if (!string.IsNullOrWhiteSpace(value)) config[key] = value;
    }

    Map("SENDGRID_API_KEY", "SendGrid:ApiKey");
    Map("FROM_EMAIL", "SendGrid:FromEmail");
    Map("FROM_NAME", "SendGrid:FromName");
    Map("ADMIN_EMAIL", "SendGrid:AdminEmail");

    Map("TWILIO_ACCOUNT_SID", "Twilio:AccountSid");
    Map("TWILIO_AUTH_TOKEN", "Twilio:AuthToken");
    Map("TWILIO_VERIFY_SERVICE_SID", "Twilio:VerifyServiceSid");

    Map("LEADS_WEBHOOK_URL", "LeadsWebhook:Url");
    Map("LEADS_WEBHOOK_API_KEY", "LeadsWebhook:ApiKey");

    var activityEnabled = Environment.GetEnvironmentVariable("ACTIVITY_LOG_ENABLED");
    if (!string.IsNullOrEmpty(activityEnabled))
    {
        config["Activity:Enabled"] = (!string.Equals(activityEnabled, "false", StringComparison.OrdinalIgnoreCase)).ToString();
    }
    Map("ACTIVITY_REPORT_KEY", "Activity:ReportKey");
    Map("ACTIVITY_IP_SALT", "Activity:IpSalt");
    Map("ACTIVITY_DAILY_REPORT_TO", "Activity:DailyReportTo");
    Map("ACTIVITY_REPORT_FILE_PATH", "Activity:FilePath");
    var maxLimit = Environment.GetEnvironmentVariable("ACTIVITY_REPORT_MAX_LIMIT");
    if (int.TryParse(maxLimit, out var lim)) config["Activity:MaxReportLimit"] = lim.ToString();
    var maxScan = Environment.GetEnvironmentVariable("ACTIVITY_REPORT_MAX_SCAN");
    if (int.TryParse(maxScan, out var scan)) config["Activity:MaxScan"] = scan.ToString();

    Map("AZURE_STORAGE_CONNECTION_STRING", "AzureStorage:ConnectionString");
    Map("AZURE_STORAGE_TABLE_NAME", "AzureStorage:TableName");
    Map("AZURE_STORAGE_MEMBERS_TABLE", "AzureStorage:MembersTableName");
    Map("AZURE_STORAGE_APPLICANTS_TABLE", "AzureStorage:ApplicantsTableName");
    Map("AZURE_STORAGE_ADMINS_TABLE", "AzureStorage:AdminsTableName");
    Map("AZURE_STORAGE_RESET_TOKENS_TABLE", "AzureStorage:PasswordResetTokensTableName");

    Map("SITE_URL", "Site:Url");
    Map("NEXT_PUBLIC_SITE_URL", "Site:Url");

    // Member auth + admin member management.
    Map("AUTH_TOKEN_SECRET", "Auth:TokenSecret");
    Map("AUTH_ADMIN_KEY", "Auth:AdminKey");
    Map("AUTH_FILE_PATH", "Auth:FilePath");
    Map("ADMIN_SEED_EMAIL", "Auth:AdminSeedEmail");
    Map("ADMIN_SEED_PASSWORD", "Auth:AdminSeedPassword");
    var ttl = Environment.GetEnvironmentVariable("AUTH_TOKEN_TTL_HOURS");
    if (int.TryParse(ttl, out var ttlHours)) config["Auth:TokenTtlHours"] = ttlHours.ToString();
    var bonus = Environment.GetEnvironmentVariable("REFERRAL_BONUS_POINTS");
    if (int.TryParse(bonus, out var bonusPoints)) config["Auth:ReferralBonusPoints"] = bonusPoints.ToString();
    var resetTtl = Environment.GetEnvironmentVariable("PASSWORD_RESET_TTL_MINUTES");
    if (int.TryParse(resetTtl, out var resetTtlMinutes)) config["Auth:PasswordResetTtlMinutes"] = resetTtlMinutes.ToString();
}
