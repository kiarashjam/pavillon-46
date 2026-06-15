using System.Net;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Localization;
using Pavillon46.Api.Models;
using SendGrid;
using SendGrid.Helpers.Mail;

namespace Pavillon46.Api.Services;

public class EmailService : IEmailService
{
    private readonly SendGridOptions _sendgrid;
    private readonly SiteOptions _site;
    private readonly ILogger<EmailService> _logger;

    public EmailService(IOptions<SendGridOptions> sendgrid, IOptions<SiteOptions> site, ILogger<EmailService> logger)
    {
        _sendgrid = sendgrid.Value;
        _site = site.Value;
        _logger = logger;
    }

    public async Task SendWaitlistEmailsAsync(WaitlistSubmitRequest request, string lang, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_sendgrid.ApiKey))
            throw new InvalidOperationException("SENDGRID_API_KEY is missing.");
        if (string.IsNullOrWhiteSpace(_sendgrid.FromEmail))
            throw new InvalidOperationException("FROM_EMAIL is missing.");
        if (string.IsNullOrWhiteSpace(_sendgrid.AdminEmail))
            throw new InvalidOperationException("ADMIN_EMAIL is missing.");
        if (string.IsNullOrWhiteSpace(request.EmailAddress))
            throw new ArgumentException("emailAddress is required");

        var fullName = $"{request.FirstName} {request.LastName}".Trim();
        var fullPhone = $"{request.CountryCode ?? "+33"} {request.PhoneNumber}".Trim();

        var admin = EmailTranslations.Admin(lang);
        var user = EmailTranslations.User(lang);
        var hearAboutHtml = EmailTranslations.FormatHearAboutHtml(lang, request.HearAboutKey, request.HearAboutOther);
        var hearAboutPlain = EmailTranslations.FormatHearAboutPlain(lang, request.HearAboutKey, request.HearAboutOther);

        var client = new SendGridClient(_sendgrid.ApiKey);
        var fromName = string.IsNullOrWhiteSpace(_sendgrid.FromName) ? "Pavillon 46" : _sendgrid.FromName;
        var from = new EmailAddress(_sendgrid.FromEmail, fromName);

        var adminMsg = new SendGridMessage
        {
            From = from,
            Subject = admin.Subject(fullName),
            PlainTextContent = BuildAdminPlainText(admin, fullName, request.EmailAddress!, fullPhone, request.PostalCode ?? "", hearAboutPlain),
            HtmlContent = BuildAdminHtml(admin, fullName, request.EmailAddress!, fullPhone, request.PostalCode ?? "", hearAboutHtml),
        };
        adminMsg.AddTo(new EmailAddress(_sendgrid.AdminEmail));

        var userMsg = new SendGridMessage
        {
            From = from,
            Subject = user.Subject,
            PlainTextContent = BuildUserPlainText(user, fullName),
            HtmlContent = BuildUserHtml(user, fullName, lang),
        };
        userMsg.AddTo(new EmailAddress(request.EmailAddress));

        var adminTask = client.SendEmailAsync(adminMsg, ct);
        var userTask = client.SendEmailAsync(userMsg, ct);
        await Task.WhenAll(adminTask, userTask);

        if ((int)adminTask.Result.StatusCode >= 400 || (int)userTask.Result.StatusCode >= 400)
        {
            var adminBody = await adminTask.Result.Body.ReadAsStringAsync(ct);
            var userBody = await userTask.Result.Body.ReadAsStringAsync(ct);
            _logger.LogError("SendGrid rejected one or both messages. Admin {AdminStatus} {AdminBody}; User {UserStatus} {UserBody}",
                adminTask.Result.StatusCode, adminBody, userTask.Result.StatusCode, userBody);
            throw new InvalidOperationException("SendGrid did not accept one or both messages.");
        }
    }

    public async Task SendRawEmailAsync(string toEmail, string subject, string plainText, string html, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_sendgrid.ApiKey)) throw new InvalidOperationException("SENDGRID_API_KEY is missing.");
        if (string.IsNullOrWhiteSpace(_sendgrid.FromEmail)) throw new InvalidOperationException("FROM_EMAIL is missing.");

        var client = new SendGridClient(_sendgrid.ApiKey);
        var fromName = string.IsNullOrWhiteSpace(_sendgrid.FromName) ? "Pavillon 46" : _sendgrid.FromName;
        var msg = MailHelper.CreateSingleEmail(
            new EmailAddress(_sendgrid.FromEmail, fromName),
            new EmailAddress(toEmail),
            subject,
            plainText,
            html);

        var response = await client.SendEmailAsync(msg, ct);
        if ((int)response.StatusCode >= 400)
        {
            var body = await response.Body.ReadAsStringAsync(ct);
            _logger.LogError("SendGrid rejected raw email to {To}: {Status} {Body}", toEmail, response.StatusCode, body);
            throw new InvalidOperationException("SendGrid did not accept the message.");
        }
    }

    public async Task SendMemberCredentialsAsync(Member member, string plainPassword, string lang, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_sendgrid.ApiKey)) throw new InvalidOperationException("SENDGRID_API_KEY is missing.");
        if (string.IsNullOrWhiteSpace(_sendgrid.FromEmail)) throw new InvalidOperationException("FROM_EMAIL is missing.");
        if (string.IsNullOrWhiteSpace(member.Email)) throw new ArgumentException("Member email is required");

        var isFr = !string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase);
        var loginUrl = $"{_site.Url.TrimEnd('/')}/login";
        var greetingName = string.IsNullOrWhiteSpace(member.FirstName) ? member.Email : member.FirstName;

        var subject = isFr ? "Vos accès — Espace membre Pavillon 46" : "Your access — Pavillon 46 member area";
        var heading = isFr ? "Bienvenue au Pavillon 46" : "Welcome to Pavillon 46";
        var intro = isFr
            ? $"Bonjour {greetingName}, votre espace membre privé est désormais ouvert. Voici vos identifiants de connexion."
            : $"Hello {greetingName}, your private member space is now open. Here are your sign-in credentials.";
        var emailLabel = isFr ? "Identifiant (e-mail)" : "Login (email)";
        var passwordLabel = isFr ? "Mot de passe temporaire" : "Temporary password";
        var cta = isFr ? "Accéder à mon espace" : "Open my member area";
        var securityNote = isFr
            ? "Pour votre sécurité, modifiez votre mot de passe après votre première connexion. Ne partagez jamais ces identifiants."
            : "For your security, change your password after your first sign-in. Never share these credentials.";

        var plain =
            $"{heading}\n\n{intro}\n\n{emailLabel}: {member.Email}\n{passwordLabel}: {plainPassword}\n\n{cta}: {loginUrl}\n\n{securityNote}";

        var html = BuildCredentialsHtml(lang, heading, intro, emailLabel, member.Email, passwordLabel, plainPassword, cta, loginUrl, securityNote);
        await SendRawEmailAsync(member.Email, subject, plain, html, ct);
    }

    public async Task SendPasswordChangedAsync(Member member, string lang, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_sendgrid.ApiKey)) throw new InvalidOperationException("SENDGRID_API_KEY is missing.");
        if (string.IsNullOrWhiteSpace(_sendgrid.FromEmail)) throw new InvalidOperationException("FROM_EMAIL is missing.");
        if (string.IsNullOrWhiteSpace(member.Email)) throw new ArgumentException("Member email is required");

        var isFr = !string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase);
        var loginUrl = $"{_site.Url.TrimEnd('/')}/login";
        var greetingName = string.IsNullOrWhiteSpace(member.FirstName) ? member.Email : member.FirstName;

        var subject = isFr ? "Votre mot de passe a été modifié — Pavillon 46" : "Your password was changed — Pavillon 46";
        var heading = isFr ? "Mot de passe modifié" : "Password changed";
        var body = isFr
            ? $"Bonjour {greetingName}, votre mot de passe d'accès à l'espace membre Pavillon 46 a bien été modifié. Si vous n'êtes pas à l'origine de ce changement, contactez-nous immédiatement."
            : $"Hello {greetingName}, the password for your Pavillon 46 member area has been changed. If you did not make this change, please contact us immediately.";
        var cta = isFr ? "Accéder à mon espace" : "Open my member area";

        var plain = $"{heading}\n\n{body}\n\n{cta}: {loginUrl}";
        var html = BuildSimpleHtml(lang, heading, body, cta, loginUrl);
        await SendRawEmailAsync(member.Email, subject, plain, html, ct);
    }

    private string BuildSimpleHtml(string lang, string heading, string body, string cta, string loginUrl)
    {
        var logo = $"{_site.Url}/images/logo.png";
        var year = DateTime.UtcNow.Year;
        return $@"<!DOCTYPE html>
<html lang=""{lang}"">
<head><meta charset=""UTF-8""><meta name=""viewport"" content=""width=device-width,initial-scale=1.0""><title>{WebUtility.HtmlEncode(heading)}</title></head>
<body style=""font-family:Jost,sans-serif;color:#1d2b24;background:#0f261d;margin:0;padding:0;"">
  <table role=""presentation"" cellspacing=""0"" cellpadding=""0"" border=""0"" width=""100%"" style=""background:#0f261d;padding:24px 0;""><tr><td align=""center"">
    <table role=""presentation"" cellspacing=""0"" cellpadding=""0"" border=""0"" width=""600"" style=""max-width:600px;margin:0 auto;background:#fcf8f7;border-radius:14px;overflow:hidden;box-shadow:0 18px 48px rgba(0,0,0,0.3);"">
      <tr><td style=""background:linear-gradient(135deg,#265640 0%,#3a6f58 100%);padding:42px 32px;text-align:center;color:#fff;"">
        <div style=""text-align:center;margin-bottom:16px;""><img src=""{logo}"" alt=""Pavillon 46"" width=""150"" style=""display:inline-block;max-width:150px;width:100%;height:auto;filter:brightness(0) invert(1);""/></div>
        <h1 style=""margin:0;font-size:28px;font-weight:500;color:#fff;"">{WebUtility.HtmlEncode(heading)}</h1>
      </td></tr>
      <tr><td style=""padding:36px 32px;"">
        <p style=""margin:0 0 26px 0;font-size:16px;color:#3a4a42;line-height:1.7;"">{WebUtility.HtmlEncode(body)}</p>
        <div style=""text-align:center;margin:8px 0;"">
          <a href=""{loginUrl}"" style=""display:inline-block;background:#ff6e50;color:#fff;text-decoration:none;font-size:16px;font-weight:500;padding:14px 34px;border-radius:8px;"">{WebUtility.HtmlEncode(cta)}</a>
        </div>
      </td></tr>
      <tr><td style=""padding:24px 32px;background:#f0ece9;border-top:1px solid rgba(38,86,64,0.1);font-size:12px;color:#8a9a92;text-align:center;line-height:1.7;"">
        <p style=""margin:0;"">© {year} Pavillon 46 — La Croix-sur-Lutry, Suisse</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>";
    }

    private string BuildCredentialsHtml(
        string lang, string heading, string intro, string emailLabel, string email,
        string passwordLabel, string password, string cta, string loginUrl, string securityNote)
    {
        var logo = $"{_site.Url}/images/logo.png";
        var year = DateTime.UtcNow.Year;
        return $@"<!DOCTYPE html>
<html lang=""{lang}"">
<head><meta charset=""UTF-8""><meta name=""viewport"" content=""width=device-width,initial-scale=1.0""><title>{WebUtility.HtmlEncode(heading)}</title></head>
<body style=""font-family:Jost,sans-serif;color:#1d2b24;background:#0f261d;margin:0;padding:0;"">
  <table role=""presentation"" cellspacing=""0"" cellpadding=""0"" border=""0"" width=""100%"" style=""background:#0f261d;padding:24px 0;""><tr><td align=""center"">
    <table role=""presentation"" cellspacing=""0"" cellpadding=""0"" border=""0"" width=""600"" style=""max-width:600px;margin:0 auto;background:#fcf8f7;border-radius:14px;overflow:hidden;box-shadow:0 18px 48px rgba(0,0,0,0.3);"">
      <tr><td style=""background:linear-gradient(135deg,#265640 0%,#3a6f58 100%);padding:42px 32px;text-align:center;color:#fff;"">
        <div style=""text-align:center;margin-bottom:16px;""><img src=""{logo}"" alt=""Pavillon 46"" width=""150"" style=""display:inline-block;max-width:150px;width:100%;height:auto;filter:brightness(0) invert(1);""/></div>
        <h1 style=""margin:0;font-size:28px;font-weight:500;color:#fff;letter-spacing:0.01em;"">{WebUtility.HtmlEncode(heading)}</h1>
      </td></tr>
      <tr><td style=""padding:36px 32px;"">
        <p style=""margin:0 0 24px 0;font-size:16px;color:#3a4a42;line-height:1.7;"">{WebUtility.HtmlEncode(intro)}</p>
        <div style=""background:#fff;border:1px solid rgba(38,86,64,0.18);border-radius:12px;padding:22px;margin:0 0 24px 0;"">
          <p style=""margin:0 0 6px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#8a9a92;"">{WebUtility.HtmlEncode(emailLabel)}</p>
          <p style=""margin:0 0 18px 0;font-size:17px;color:#1d2b24;font-weight:500;"">{WebUtility.HtmlEncode(email)}</p>
          <p style=""margin:0 0 6px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#8a9a92;"">{WebUtility.HtmlEncode(passwordLabel)}</p>
          <p style=""margin:0;font-size:20px;color:#265640;font-weight:600;font-family:'Courier New',monospace;letter-spacing:0.04em;"">{WebUtility.HtmlEncode(password)}</p>
        </div>
        <div style=""text-align:center;margin:28px 0;"">
          <a href=""{loginUrl}"" style=""display:inline-block;background:#ff6e50;color:#fff;text-decoration:none;font-size:16px;font-weight:500;padding:14px 34px;border-radius:8px;"">{WebUtility.HtmlEncode(cta)}</a>
        </div>
        <p style=""margin:18px 0 0 0;font-size:13px;color:#8a9a92;line-height:1.6;"">{WebUtility.HtmlEncode(securityNote)}</p>
      </td></tr>
      <tr><td style=""padding:24px 32px;background:#f0ece9;border-top:1px solid rgba(38,86,64,0.1);font-size:12px;color:#8a9a92;text-align:center;line-height:1.7;"">
        <p style=""margin:0;"">© {year} Pavillon 46 — La Croix-sur-Lutry, Suisse</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>";
    }

    private string BuildAdminPlainText(EmailTranslations.AdminStrings t, string fullName, string emailAddress, string fullPhone, string postalCode, string hearAboutPlain) =>
        $"{t.Intro}\n{t.NameLabel} {fullName}\n{t.EmailLabel} {emailAddress}\n{t.PhoneLabel} {fullPhone}\n{t.PostalCodeLabel} {postalCode}\n{t.HearAboutLabel} {hearAboutPlain}\n\n{t.LanguageNote}";

    private string BuildAdminHtml(EmailTranslations.AdminStrings t, string fullName, string emailAddress, string fullPhone, string postalCode, string hearAboutHtml)
    {
        var logo = $"{_site.Url}/images/logo.png";
        return $@"
<div style=""font-family:Jost,sans-serif;color:#333;background:#fafafa;padding:0;"">
  <div style=""max-width:600px;margin:0 auto;background:rgba(255,255,255,0.95);border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);"">
    <div style=""background:linear-gradient(135deg,rgba(102,126,234,0.7) 0%,rgba(118,75,162,0.7) 100%);padding:40px 30px;text-align:center;color:#fff;"">
      <div style=""text-align:center;margin-bottom:20px;""><img src=""{logo}"" alt=""Pavillon 46"" width=""150"" style=""display:inline-block;max-width:150px;width:100%;height:auto;""/></div>
      <h2 style=""margin:0;color:rgba(255,255,255,0.95);font-size:24px;"">{WebUtility.HtmlEncode(t.Title)}</h2>
    </div>
    <div style=""padding:40px 30px;background:rgba(255,255,255,0.95);"">
      <p style=""font-size:16px;margin-bottom:20px;""><strong>{WebUtility.HtmlEncode(t.Intro)}</strong></p>
      <table style=""width:100%;border-collapse:collapse;margin-top:15px;"">
        <tr><td style=""padding:12px;border-bottom:1px solid rgba(238,238,238,0.6);width:30%;background:rgba(248,249,250,0.5);""><strong>{WebUtility.HtmlEncode(t.NameLabel)}</strong></td><td style=""padding:12px;border-bottom:1px solid rgba(238,238,238,0.6);"">{WebUtility.HtmlEncode(fullName)}</td></tr>
        <tr><td style=""padding:12px;border-bottom:1px solid rgba(238,238,238,0.6);background:rgba(248,249,250,0.5);""><strong>{WebUtility.HtmlEncode(t.EmailLabel)}</strong></td><td style=""padding:12px;border-bottom:1px solid rgba(238,238,238,0.6);"">{WebUtility.HtmlEncode(emailAddress)}</td></tr>
        <tr><td style=""padding:12px;border-bottom:1px solid rgba(238,238,238,0.6);background:rgba(248,249,250,0.5);""><strong>{WebUtility.HtmlEncode(t.PhoneLabel)}</strong></td><td style=""padding:12px;border-bottom:1px solid rgba(238,238,238,0.6);"">{WebUtility.HtmlEncode(fullPhone)}</td></tr>
        <tr><td style=""padding:12px;border-bottom:1px solid rgba(238,238,238,0.6);background:rgba(248,249,250,0.5);""><strong>{WebUtility.HtmlEncode(t.PostalCodeLabel)}</strong></td><td style=""padding:12px;border-bottom:1px solid rgba(238,238,238,0.6);"">{WebUtility.HtmlEncode(postalCode)}</td></tr>
        <tr><td style=""padding:12px;border-bottom:1px solid rgba(238,238,238,0.6);background:rgba(248,249,250,0.5);""><strong>{WebUtility.HtmlEncode(t.HearAboutLabel)}</strong></td><td style=""padding:12px;border-bottom:1px solid rgba(238,238,238,0.6);"">{hearAboutHtml}</td></tr>
        <tr><td style=""padding:12px;border-top:2px solid rgba(221,221,221,0.5);background:rgba(240,244,255,0.4);"" colspan=""2""><strong>{WebUtility.HtmlEncode(t.LanguageNote)}</strong></td></tr>
      </table>
    </div>
    <div style=""margin-top:30px;padding:30px;background:rgba(248,249,250,0.6);border-top:1px solid rgba(234,234,234,0.5);font-size:13px;color:#666;text-align:center;line-height:1.8;""><p>{WebUtility.HtmlEncode(t.Footer)}</p></div>
  </div>
</div>";
    }

    private string BuildUserPlainText(EmailTranslations.UserStrings t, string fullName)
    {
        var plainBody1 = System.Text.RegularExpressions.Regex.Replace(t.Body1, "<strong>|</strong>", "");
        return $"{t.Greeting(fullName)}\n\n{plainBody1}\n\n{t.Body2}\n\n{t.Body3}\n\n{t.Closing}\n{t.Team}";
    }

    private string BuildUserHtml(EmailTranslations.UserStrings t, string fullName, string lang)
    {
        var logo = $"{_site.Url}/images/logo.png";
        var year = DateTime.UtcNow.Year;
        return $@"<!DOCTYPE html>
<html lang=""{lang}"">
<head><meta charset=""UTF-8""><meta name=""viewport"" content=""width=device-width,initial-scale=1.0""><title>{WebUtility.HtmlEncode(t.Subject)}</title></head>
<body style=""font-family:Jost,sans-serif;color:#333;background:#fafafa;margin:0;padding:0;"">
  <table role=""presentation"" cellspacing=""0"" cellpadding=""0"" border=""0"" width=""100%"" style=""background:#fafafa;padding:20px 0;""><tr><td align=""center"">
    <table role=""presentation"" cellspacing=""0"" cellpadding=""0"" border=""0"" width=""600"" style=""max-width:600px;margin:0 auto;background:rgba(255,255,255,0.95);border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);"">
      <tr><td style=""background:linear-gradient(135deg,rgba(102,126,234,0.7) 0%,rgba(118,75,162,0.7) 100%);padding:40px 30px;text-align:center;color:#fff;"">
        <div style=""text-align:center;margin-bottom:20px;""><img src=""{logo}"" alt=""Pavillon 46"" width=""150"" style=""display:inline-block;max-width:150px;width:100%;height:auto;""/></div>
        <h1 style=""margin:0;font-size:32px;font-weight:700;color:rgba(255,255,255,0.95);letter-spacing:-0.5px;"">{WebUtility.HtmlEncode(t.Title)}</h1>
        <p style=""margin:10px 0 0 0;font-size:16px;color:rgba(255,255,255,0.85);"">{WebUtility.HtmlEncode(t.Tagline)}</p>
      </td></tr>
      <tr><td style=""padding:40px 30px;background:rgba(255,255,255,0.95);"">
        <p style=""margin:0 0 20px 0;font-size:18px;color:#333;font-weight:500;"">{WebUtility.HtmlEncode(t.Greeting(fullName))}</p>
        <p style=""margin:0 0 20px 0;font-size:16px;color:#555;line-height:1.8;"">{t.Body1}</p>
        <div style=""background:rgba(248,249,255,0.5);border-left:4px solid rgba(102,126,234,0.4);padding:20px;margin:25px 0;border-radius:4px;""><p style=""margin:0;font-size:15px;color:#444;line-height:1.8;"">{WebUtility.HtmlEncode(t.Body2)}</p></div>
        <p style=""margin:20px 0;font-size:16px;color:#555;line-height:1.8;"">{WebUtility.HtmlEncode(t.Body3)}</p>
        <div style=""height:1px;background:linear-gradient(to right,transparent,rgba(224,224,224,0.5),transparent);margin:35px 0;""></div>
        <p style=""margin:0 0 8px 0;font-size:16px;color:#333;"">{WebUtility.HtmlEncode(t.Closing)}</p>
        <p style=""margin:0;font-size:18px;color:rgba(102,126,234,0.8);font-weight:600;"">{WebUtility.HtmlEncode(t.Team)}</p>
      </td></tr>
      <tr><td style=""margin-top:30px;padding:30px;background:rgba(248,249,250,0.6);border-top:1px solid rgba(234,234,234,0.5);font-size:13px;color:#666;text-align:center;line-height:1.8;"">
        <p style=""margin:0 0 8px 0;"">{t.Footer(year)}</p>
        <p style=""margin:0;color:#999;font-size:12px;"">{WebUtility.HtmlEncode(t.Location)}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>";
    }
}
