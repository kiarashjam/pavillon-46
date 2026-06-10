using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface IEmailService
{
    Task SendWaitlistEmailsAsync(WaitlistSubmitRequest request, string lang, CancellationToken ct = default);
    Task SendRawEmailAsync(string toEmail, string subject, string plainText, string html, CancellationToken ct = default);
}
