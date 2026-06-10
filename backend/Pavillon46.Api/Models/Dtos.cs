using System.Text.Json.Serialization;

namespace Pavillon46.Api.Models;

public record WaitlistSubmitRequest(
    string? FirstName,
    string? LastName,
    string? CountryCode,
    string? PhoneNumber,
    string? EmailAddress,
    string? PostalCode,
    string? HearAboutKey,
    string? HearAboutOther,
    string? Language
);

public record SendVerificationRequest(string? CountryCode, string? PhoneNumber);

public record VerifyCodeRequest(string? CountryCode, string? PhoneNumber, string? Code);

public class ActivityLogRequest
{
    public string? Type { get; set; }
    public string? Path { get; set; }
    public string? SessionId { get; set; }
    public string? Ts { get; set; }
    public ActivityElement? Element { get; set; }
}

public class ActivityElement
{
    public string? Tag { get; set; }
    public string? Id { get; set; }
    public string? Text { get; set; }
}

public class ActivityEvent
{
    public string Id { get; set; } = "";
    public string Type { get; set; } = "page_view";
    public string Path { get; set; } = "/";
    public string Ts { get; set; } = "";
    public string SessionId { get; set; } = "";
    public string UserAgent { get; set; } = "";
    public string Referrer { get; set; } = "";
    public string IpHash { get; set; } = "";
    public ActivityElement Element { get; set; } = new();
}

public class ActivityReportFilters
{
    public string? From { get; set; }
    public string? To { get; set; }
    public string Type { get; set; } = "all";
    public string Path { get; set; } = "";
    public int Limit { get; set; } = 300;
}

public class ActivityReport
{
    public List<ActivityEvent> Events { get; set; } = new();
    public ActivitySummary Summary { get; set; } = new();
    public ActivityMeta Meta { get; set; } = new();
    public string Storage { get; set; } = "memory";
}

public class ActivitySummary
{
    public int TotalEvents { get; set; }
    public int PageViews { get; set; }
    public int Clicks { get; set; }
    public int UniqueSessions { get; set; }
    public List<RankedPath> TopPages { get; set; } = new();
    public List<RankedLabel> TopClicks { get; set; } = new();
}

public class ActivityMeta
{
    public int ScannedEvents { get; set; }
    public int? MaxScan { get; set; }
    public bool Truncated { get; set; }
    public string? LatestEventTs { get; set; }
    public string? OldestEventTs { get; set; }
}

public record RankedPath(string Path, int Count);
public record RankedLabel(string Label, int Count);
public record RankedReferrer(string Referrer, int Count);

public record LeadPayload(
    string Name,
    string Email,
    string Phone,
    [property: JsonPropertyName("companyName")] string CompanyName,
    string Source
);

public class WebhookResult
{
    public bool Ok { get; set; }
    public bool Attempted { get; set; }
    public bool Skipped { get; set; }
    public string? Reason { get; set; }
    public int? HttpStatus { get; set; }
    public string? DestinationHost { get; set; }
    public string? Error { get; set; }
    public string? Summary { get; set; }
}
