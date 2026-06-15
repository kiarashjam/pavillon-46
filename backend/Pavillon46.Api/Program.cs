using System.Text.Json;
using System.Text.Json.Serialization;
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
builder.Services.AddSingleton<ITokenService, TokenService>();
builder.Services.AddSingleton<IAnnouncementService, AnnouncementService>();
builder.Services.AddSingleton<RateLimiter>(_ => new RateLimiter { MaxEvents = 30, WindowMs = 15_000 });
builder.Services.AddHttpClient<ILeadsWebhookService, LeadsWebhookService>();

builder.Services.AddControllers()
    .AddJsonOptions(opts =>
    {
        opts.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        opts.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

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

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseRouting();
app.MapControllers();
app.MapGet("/healthz", () => Results.Ok(new { ok = true }));

app.Run();

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

    Map("SITE_URL", "Site:Url");
    Map("NEXT_PUBLIC_SITE_URL", "Site:Url");

    // Member auth + admin member management.
    Map("AUTH_TOKEN_SECRET", "Auth:TokenSecret");
    Map("AUTH_ADMIN_KEY", "Auth:AdminKey");
    Map("AUTH_FILE_PATH", "Auth:FilePath");
    var ttl = Environment.GetEnvironmentVariable("AUTH_TOKEN_TTL_HOURS");
    if (int.TryParse(ttl, out var ttlHours)) config["Auth:TokenTtlHours"] = ttlHours.ToString();
    var bonus = Environment.GetEnvironmentVariable("REFERRAL_BONUS_POINTS");
    if (int.TryParse(bonus, out var bonusPoints)) config["Auth:ReferralBonusPoints"] = bonusPoints.ToString();
}
