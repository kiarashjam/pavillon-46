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
}

public class SiteOptions
{
    public string Url { get; set; } = "https://pavillon46.ch";
}
