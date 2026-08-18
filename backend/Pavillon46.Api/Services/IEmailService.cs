using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface IEmailService
{
    Task SendWaitlistEmailsAsync(WaitlistSubmitRequest request, string lang, CancellationToken ct = default);
    Task SendRawEmailAsync(string toEmail, string subject, string plainText, string html, CancellationToken ct = default);
    Task SendMemberCredentialsAsync(Member member, string plainPassword, string lang, CancellationToken ct = default);
    Task SendPasswordChangedAsync(Member member, string lang, CancellationToken ct = default);
    Task SendPasswordResetEmailAsync(Member member, string resetUrl, DateTime expiresAtUtc, int ttlMinutes, string lang, CancellationToken ct = default);
    Task SendAdminPasswordResetEmailAsync(Admin admin, string resetUrl, DateTime expiresAtUtc, int ttlMinutes, CancellationToken ct = default);
    Task SendAdminPasswordChangedAsync(Admin admin, CancellationToken ct = default);
}
