using System.Text.Json;

namespace Pavillon46.Api.Models;

// ---------------------------------------------------------------------------
// The CadenceE CRM's onboarding handoff. The CRM posts one signed envelope per
// event; `payload` depends on `eventName`. See backend/README.md for the
// contract and CadenceIntegrationController for how it is checked.
// ---------------------------------------------------------------------------

public class CadenceEnvelope
{
    public string? EventName { get; set; }
    public JsonElement Payload { get; set; }
    // The same on every retry of one event: the key that keeps a retry from
    // opening a second account or sending a second email.
    public string? Id { get; set; }
    public string? OrganizationId { get; set; }
}

public class CadenceOnboardingPayload
{
    public int Version { get; set; }
    public string? OnboardingId { get; set; }
    public CadenceDeal? Deal { get; set; }
    public CadenceContact? Contact { get; set; }
    public CadenceMembership? Membership { get; set; }
    public string? Language { get; set; }
    // Plain text, as the CRM user typed it. HTML-encoded wherever it is shown.
    public string? WelcomeMessage { get; set; }
    // The organisation's own design, with the CRM's placeholders filled.
    // Null: send Pavillon's own welcome email.
    public CadenceEmail? Email { get; set; }
    public CadenceCallback? Callback { get; set; }
    // Who the welcome is from: the organisation that won the deal. See
    // EmailService.WelcomeSender for what is honoured.
    public CadenceFrom? From { get; set; }
}

public class CadenceFrom
{
    public string? Name { get; set; }
    public string? Email { get; set; }
    public string? ReplyTo { get; set; }
}

public class CadenceDeal
{
    public string? Id { get; set; }
    public string? Name { get; set; }
}

public class CadenceContact
{
    public string? Name { get; set; }
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
}

public class CadenceMembership
{
    // "yyyy-MM-dd", or null when the start is still to be decided.
    public string? StartsOn { get; set; }
    public bool StartUndetermined { get; set; }
}

public class CadenceEmail
{
    public string? Subject { get; set; }
    public string? Html { get; set; }
}

public class CadenceCallback
{
    public string? Url { get; set; }
    public string? Token { get; set; }
}

// One processed handoff event, remembered so that a retry of the same event
// answers the same result and sends nothing again.
public class CadenceEventRecord
{
    // The envelope's id. JsonTableStore<T> uses this as the RowKey.
    public string Id { get; set; } = "";
    public string OnboardingId { get; set; } = "";
    public string AccountId { get; set; } = "";
    // "created" | "existing" | "rejected"
    public string Status { get; set; } = "";
    public string ReceivedAtUtc { get; set; } = "";
}

// Everything the welcome email needs, once the account is ready.
public sealed record CadenceWelcome(
    string Language,
    string? CustomSubject,
    string? CustomHtml,
    string? WelcomeMessage,
    string MembershipStartDate,
    bool MembershipStartUndetermined,
    string SetPasswordUrl,
    DateTime ExpiresAtUtc,
    CadenceFrom? From = null);

// Who a welcome email actually went out from, for the report to the CRM.
// RequestedEmail is set when the CRM asked for an address this portal may not
// send from, and so was not used.
public sealed record CadenceSender(string Name, string Email, string? ReplyTo, string? RequestedEmail);

// What the handoff endpoint answers.
public class CadenceHandoffResponse
{
    public string AccountId { get; set; } = "";
    public string Status { get; set; } = "";
    public string? Message { get; set; }
}
