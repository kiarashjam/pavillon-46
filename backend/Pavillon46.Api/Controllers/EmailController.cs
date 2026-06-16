using Microsoft.AspNetCore.Mvc;
using Pavillon46.Api.Localization;
using Pavillon46.Api.Models;
using Pavillon46.Api.Services;

namespace Pavillon46.Api.Controllers;

[ApiController]
[Route("api")]
public class EmailController : ControllerBase
{
    private readonly IEmailService _email;
    private readonly ILeadsWebhookService _webhook;
    private readonly IMemberStore _members;
    private readonly ILogger<EmailController> _logger;

    public EmailController(IEmailService email, ILeadsWebhookService webhook, IMemberStore members, ILogger<EmailController> logger)
    {
        _email = email;
        _webhook = webhook;
        _members = members;
        _logger = logger;
    }

    [HttpPost("send-email")]
    public async Task<IActionResult> SendEmail([FromBody] WaitlistSubmitRequest body, CancellationToken ct)
    {
        if (body is null) return BadRequest(new { message = "Invalid request body" });

        var lang = EmailTranslations.NormalizeLang(body.Language);

        try
        {
            await _email.SendWaitlistEmailsAsync(body, lang, ct);
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("missing", StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogError(ex, "Email send failed due to missing config");
            return StatusCode(500, new
            {
                message = "Server configuration error",
                detail = ex.Message,
                email = new { ok = false, provider = "sendgrid", summary = "Configuration is missing for SendGrid." },
                webhook = new { ok = false, attempted = false, skipped = true, reason = "emails_not_sent", summary = "Webhook is only run after both emails send successfully." }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Email send failed");
            return StatusCode(500, new
            {
                message = "Error sending emails",
                email = new { ok = false, provider = "sendgrid", stage = "sendgrid_send", summary = "SendGrid did not accept one or both messages. No lead webhook was called because emails did not complete." },
                webhook = new { ok = false, attempted = false, skipped = true, reason = "emails_not_sent", summary = "Webhook is only run after both emails send successfully." }
            });
        }

        var fullName = $"{body.FirstName} {body.LastName}".Trim();
        var fullPhone = $"{body.CountryCode ?? "+33"} {body.PhoneNumber}".Trim();

        // If a referral code was supplied (typed, or pre-filled from a member's
        // share link), resolve it to the referring member so Cadence sees who
        // referred this signup — same semantics as a dashboard referral.
        var source = "website-form";
        string? referredBy = null;
        string? referrerEmail = null;
        var referralCode = body.ReferralCode?.Trim();
        if (!string.IsNullOrEmpty(referralCode))
        {
            var referrer = await _members.GetByReferralCodeAsync(referralCode, ct);
            if (referrer is not null)
            {
                referredBy = $"{referrer.FirstName} {referrer.LastName}".Trim();
                referrerEmail = referrer.Email;
                source = "Referral from pavillon46.ch";
            }
        }

        var lead = new LeadPayload(
            Name: fullName,
            Email: (body.EmailAddress ?? "").Trim(),
            Phone: fullPhone,
            CompanyName: "",
            Source: source,
            ReferredBy: referredBy,
            ReferrerEmail: referrerEmail);

        var webhookResult = await _webhook.PostLeadAsync(lead, ct);

        return Ok(new
        {
            message = "Emails sent successfully",
            email = new
            {
                ok = true,
                provider = "sendgrid",
                summary = "Admin notification and user confirmation were both accepted by SendGrid.",
                sends = new object[]
                {
                    new { role = "admin_notification", ok = true, description = "Waitlist signup notification to the configured admin inbox." },
                    new { role = "user_confirmation", ok = true, description = "Confirmation email to the address submitted on the form.", sentTo = body.EmailAddress }
                }
            },
            webhook = webhookResult.Skipped
                ? (object)new
                {
                    ok = false,
                    attempted = false,
                    skipped = true,
                    reason = webhookResult.Reason,
                    summary = webhookResult.Summary
                }
                : new
                {
                    ok = webhookResult.Ok,
                    attempted = true,
                    skipped = false,
                    httpStatus = webhookResult.HttpStatus,
                    destinationHost = webhookResult.DestinationHost,
                    summary = webhookResult.Summary,
                    error = webhookResult.Ok ? null : webhookResult.Error
                }
        });
    }
}
