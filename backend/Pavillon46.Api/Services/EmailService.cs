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

    private sealed record CredentialsVm(
        string Lang, string Eyebrow, string Heading, string Intro,
        string EmailLabel, string Email, string PasswordLabel, string Password,
        string OneTimeBadge, string OneTimeNote, string Cta, string LoginUrl,
        string SecurityNote, string[] Steps);

    public async Task SendMemberCredentialsAsync(Member member, string plainPassword, string lang, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_sendgrid.ApiKey)) throw new InvalidOperationException("SENDGRID_API_KEY is missing.");
        if (string.IsNullOrWhiteSpace(_sendgrid.FromEmail)) throw new InvalidOperationException("FROM_EMAIL is missing.");
        if (string.IsNullOrWhiteSpace(member.Email)) throw new ArgumentException("Member email is required");

        var isFr = !string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase);
        var loginUrl = $"{_site.Url.TrimEnd('/')}/login";
        var greetingName = string.IsNullOrWhiteSpace(member.FirstName)
            ? (string.IsNullOrWhiteSpace(member.Title) ? member.Email : member.Title)
            : $"{member.Title} {member.FirstName}".Trim();

        var vm = new CredentialsVm(
            Lang: isFr ? "fr" : "en",
            Eyebrow: isFr ? "Adhésion privée" : "Private membership",
            Heading: isFr ? "Bienvenue au Pavillon 46" : "Welcome to Pavillon 46",
            Intro: isFr
                ? $"Bonjour {greetingName}, votre espace membre privé est désormais ouvert. Voici vos identifiants de première connexion."
                : $"Hello {greetingName}, your private member space is now open. Here are your first sign-in credentials.",
            EmailLabel: isFr ? "Identifiant (e-mail)" : "Login (email)",
            Email: member.Email,
            PasswordLabel: isFr ? "Mot de passe à usage unique" : "One-time password",
            Password: plainPassword,
            OneTimeBadge: isFr ? "À usage unique" : "One-time only",
            OneTimeNote: isFr
                ? "Lors de votre première connexion, vous devrez créer votre propre mot de passe. Celui-ci ne fonctionne qu'une seule fois."
                : "At your first sign-in you'll be asked to create your own password. This one only works once.",
            Cta: isFr ? "Accéder à mon espace" : "Open my member area",
            LoginUrl: loginUrl,
            SecurityNote: isFr
                ? "Ne partagez jamais ces identifiants. Si vous n'attendiez pas cet e-mail, ignorez-le."
                : "Never share these credentials. If you weren't expecting this email, please ignore it.",
            Steps: isFr
                ? new[] { "Connectez-vous", "Choisissez votre mot de passe", "Parrainez vos proches" }
                : new[] { "Sign in", "Set your password", "Start referring" });

        var subject = isFr ? "Vos accès — Espace membre Pavillon 46" : "Your access — Pavillon 46 member area";
        var plain =
            $"{vm.Heading}\n\n{vm.Intro}\n\n{vm.EmailLabel}: {member.Email}\n{vm.PasswordLabel}: {plainPassword}\n\n{vm.OneTimeNote}\n\n{vm.Cta}: {loginUrl}\n\n{vm.SecurityNote}";

        var html = BuildCredentialsHtml(vm);
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

    public async Task SendPasswordResetEmailAsync(Member member, string resetUrl, DateTime expiresAtUtc, int ttlMinutes, string lang, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_sendgrid.ApiKey)) throw new InvalidOperationException("SENDGRID_API_KEY is missing.");
        if (string.IsNullOrWhiteSpace(_sendgrid.FromEmail)) throw new InvalidOperationException("FROM_EMAIL is missing.");
        if (string.IsNullOrWhiteSpace(member.Email)) throw new ArgumentException("Member email is required");
        if (string.IsNullOrWhiteSpace(resetUrl)) throw new ArgumentException("Reset URL is required");

        var normalized = EmailTranslations.NormalizeLang(lang);
        var t = EmailTranslations.PasswordReset(normalized);
        var greetingName = string.IsNullOrWhiteSpace(member.FirstName) ? member.Email : member.FirstName;

        // Swiss local time for the human-readable expiration line. Falls back
        // to UTC on Windows/Linux where the tzdata id might be missing (rare).
        string expiryLocal;
        try
        {
            var swiss = TimeZoneInfo.FindSystemTimeZoneById(
                OperatingSystem.IsWindows() ? "W. Europe Standard Time" : "Europe/Zurich");
            var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(expiresAtUtc, DateTimeKind.Utc), swiss);
            var culture = normalized == "en" ? new System.Globalization.CultureInfo("en-GB") : new System.Globalization.CultureInfo("fr-CH");
            expiryLocal = local.ToString("HH:mm", culture);
        }
        catch (TimeZoneNotFoundException)
        {
            expiryLocal = expiresAtUtc.ToString("HH:mm") + " UTC";
        }

        var body1 = t.Body1(greetingName, ttlMinutes);
        var expiry = t.ExpiryLine(expiryLocal);

        var plain =
            $"{t.Heading}\n\n{body1}\n\n{t.Body2}\n\n{t.Cta}: {resetUrl}\n\n{expiry}";

        var html = BuildResetPasswordHtml(normalized, t.Heading, body1, t.Body2, expiry, t.Cta, resetUrl);
        await SendRawEmailAsync(member.Email, t.Subject, plain, html, ct);
    }

    public async Task SendAdminPasswordResetEmailAsync(Admin admin, string resetUrl, DateTime expiresAtUtc, int ttlMinutes, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_sendgrid.ApiKey)) throw new InvalidOperationException("SENDGRID_API_KEY is missing.");
        if (string.IsNullOrWhiteSpace(_sendgrid.FromEmail)) throw new InvalidOperationException("FROM_EMAIL is missing.");
        if (string.IsNullOrWhiteSpace(admin.Email)) throw new ArgumentException("Admin email is required");
        if (string.IsNullOrWhiteSpace(resetUrl)) throw new ArgumentException("Reset URL is required");

        var t = EmailTranslations.AdminPasswordReset();
        var greetingName = string.IsNullOrWhiteSpace(admin.FirstName) ? admin.Email : admin.FirstName;
        var expiryLocal = FormatSwissExpiry(expiresAtUtc, "en");
        var body1 = t.Body1(greetingName, ttlMinutes);
        var expiry = t.ExpiryLine(expiryLocal);

        var plain =
            $"{t.Heading}\n\n{body1}\n\n{t.Body2}\n\n{t.Cta}: {resetUrl}\n\n{expiry}";
        var html = BuildResetPasswordHtml("en", t.Heading, body1, t.Body2, expiry, t.Cta, resetUrl);
        await SendRawEmailAsync(admin.Email, t.Subject, plain, html, ct);
    }

    public async Task SendAdminPasswordChangedAsync(Admin admin, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_sendgrid.ApiKey)) throw new InvalidOperationException("SENDGRID_API_KEY is missing.");
        if (string.IsNullOrWhiteSpace(_sendgrid.FromEmail)) throw new InvalidOperationException("FROM_EMAIL is missing.");
        if (string.IsNullOrWhiteSpace(admin.Email)) throw new ArgumentException("Admin email is required");

        var loginUrl = $"{_site.Url.TrimEnd('/')}/admin/login";
        var greetingName = string.IsNullOrWhiteSpace(admin.FirstName) ? admin.Email : admin.FirstName;
        const string subject = "Your admin password was changed — Pavillon 46";
        const string heading = "Admin password changed";
        var body =
            $"Hello {greetingName}, the password for your Pavillon 46 admin console has been changed. If you did not make this change, please contact us immediately.";
        const string cta = "Open admin sign in";

        var plain = $"{heading}\n\n{body}\n\n{cta}: {loginUrl}";
        var html = BuildSimpleHtml("en", heading, body, cta, loginUrl);
        await SendRawEmailAsync(admin.Email, subject, plain, html, ct);
    }

    public async Task SendAdminCredentialsAsync(Admin admin, string plainPassword, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_sendgrid.ApiKey)) throw new InvalidOperationException("SENDGRID_API_KEY is missing.");
        if (string.IsNullOrWhiteSpace(_sendgrid.FromEmail)) throw new InvalidOperationException("FROM_EMAIL is missing.");
        if (string.IsNullOrWhiteSpace(admin.Email)) throw new ArgumentException("Admin email is required");

        var loginUrl = $"{_site.Url.TrimEnd('/')}/admin/login";
        var greetingName = string.IsNullOrWhiteSpace(admin.FirstName)
            ? (string.IsNullOrWhiteSpace(admin.Title) ? admin.Email : admin.Title)
            : $"{admin.Title} {admin.FirstName}".Trim();

        var vm = new CredentialsVm(
            Lang: "en",
            Eyebrow: "Admin console",
            Heading: "Your Pavillon 46 desk",
            Intro: $"Hello {greetingName}, an admin account has been opened for you. Here are your first sign-in credentials.",
            EmailLabel: "Login (email)",
            Email: admin.Email,
            PasswordLabel: "One-time password",
            Password: plainPassword,
            OneTimeBadge: "One-time only",
            OneTimeNote: "At your first sign-in you'll be asked to create your own password. This one only works once.",
            Cta: "Open the admin console",
            LoginUrl: loginUrl,
            SecurityNote: "Never share these credentials. If you weren't expecting this email, please ignore it.",
            Steps: new[] { "Sign in", "Set your password", "Open the desk" });

        const string subject = "Your access — Pavillon 46 admin console";
        var plain =
            $"{vm.Heading}\n\n{vm.Intro}\n\n{vm.EmailLabel}: {admin.Email}\n{vm.PasswordLabel}: {plainPassword}\n\n{vm.OneTimeNote}\n\n{vm.Cta}: {loginUrl}\n\n{vm.SecurityNote}";

        var html = BuildCredentialsHtml(vm);
        await SendRawEmailAsync(admin.Email, subject, plain, html, ct);
    }

    private static string FormatSwissExpiry(DateTime expiresAtUtc, string lang)
    {
        try
        {
            var swiss = TimeZoneInfo.FindSystemTimeZoneById(
                OperatingSystem.IsWindows() ? "W. Europe Standard Time" : "Europe/Zurich");
            var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(expiresAtUtc, DateTimeKind.Utc), swiss);
            var culture = lang == "en" ? new System.Globalization.CultureInfo("en-GB") : new System.Globalization.CultureInfo("fr-CH");
            return local.ToString("HH:mm", culture);
        }
        catch (TimeZoneNotFoundException)
        {
            return expiresAtUtc.ToString("HH:mm") + " UTC";
        }
    }

    private string BuildResetPasswordHtml(string lang, string heading, string body1, string body2, string expiryLine, string cta, string ctaUrl)
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
        <p style=""margin:0 0 18px 0;font-size:16px;color:#3a4a42;line-height:1.7;"">{WebUtility.HtmlEncode(body1)}</p>
        <p style=""margin:0 0 26px 0;font-size:15px;color:#6f8079;line-height:1.7;"">{WebUtility.HtmlEncode(body2)}</p>
        <div style=""text-align:center;margin:8px 0;"">
          <a href=""{ctaUrl}"" style=""display:inline-block;background:#ff6e50;color:#fff;text-decoration:none;font-size:16px;font-weight:500;padding:14px 34px;border-radius:8px;"">{WebUtility.HtmlEncode(cta)}</a>
        </div>
        <p style=""margin:22px 0 0 0;font-size:13px;color:#8a9a92;text-align:center;line-height:1.6;"">{WebUtility.HtmlEncode(expiryLine)}</p>
      </td></tr>
      <tr><td style=""padding:24px 32px;background:#f0ece9;border-top:1px solid rgba(38,86,64,0.1);font-size:12px;color:#8a9a92;text-align:center;line-height:1.7;"">
        <p style=""margin:0;"">© {year} Pavillon 46 — La Croix-sur-Lutry, Suisse</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>";
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

    private string BuildCredentialsHtml(CredentialsVm vm)
    {
        var logo = $"{_site.Url}/images/logo.png";
        var year = DateTime.UtcNow.Year;

        var stepsBuilder = new System.Text.StringBuilder();
        for (var i = 0; i < vm.Steps.Length; i++)
        {
            stepsBuilder.Append($@"<td width=""33%"" valign=""top"" style=""text-align:center;padding:0 6px;"">
              <div style=""width:30px;height:30px;line-height:30px;border-radius:50%;margin:0 auto 8px;background:rgba(38,86,64,0.1);color:#265640;font-weight:700;font-size:13px;"">{i + 1}</div>
              <p style=""margin:0;font-size:12.5px;color:#6f8079;line-height:1.4;"">{WebUtility.HtmlEncode(vm.Steps[i])}</p>
            </td>");
        }
        var steps = stepsBuilder.ToString();

        return $@"<!DOCTYPE html>
<html lang=""{vm.Lang}"">
<head><meta charset=""UTF-8""><meta name=""viewport"" content=""width=device-width,initial-scale=1.0""><title>{WebUtility.HtmlEncode(vm.Heading)}</title></head>
<body style=""margin:0;padding:0;background:#0e271e;font-family:Jost,'Helvetica Neue',Arial,sans-serif;color:#1d2b24;"">
  <table role=""presentation"" width=""100%"" cellspacing=""0"" cellpadding=""0"" border=""0"" style=""background:#0e271e;padding:32px 0;""><tr><td align=""center"">
    <table role=""presentation"" width=""600"" cellspacing=""0"" cellpadding=""0"" border=""0"" style=""max-width:600px;width:100%;background:#fcf8f7;border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.35);"">
      <tr><td style=""background-color:#15362a;background:linear-gradient(135deg,#1f4a39 0%,#15362a 60%,#0e271e 100%);padding:46px 40px 40px;text-align:center;"">
        <img src=""{logo}"" alt=""Pavillon 46"" width=""148"" style=""display:inline-block;max-width:148px;width:100%;height:auto;filter:brightness(0) invert(1);opacity:.96;margin-bottom:22px;""/>
        <p style=""margin:0 0 10px;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:#e0bffc;font-weight:600;"">{WebUtility.HtmlEncode(vm.Eyebrow)}</p>
        <h1 style=""margin:0;font-size:30px;line-height:1.15;font-weight:300;color:#fff;letter-spacing:0.01em;"">{WebUtility.HtmlEncode(vm.Heading)}</h1>
        <div style=""width:46px;height:2px;background:#ff6e50;margin:18px auto 0;border-radius:2px;""></div>
      </td></tr>
      <tr><td style=""padding:38px 40px 8px;"">
        <p style=""margin:0 0 26px;font-size:16px;line-height:1.7;color:#3a4a42;"">{WebUtility.HtmlEncode(vm.Intro)}</p>
        <table role=""presentation"" width=""100%"" cellspacing=""0"" cellpadding=""0"" border=""0"" style=""background:#fff;border:1px solid rgba(38,86,64,0.16);border-radius:14px;"">
          <tr><td style=""padding:22px 24px 4px;"">
            <p style=""margin:0 0 6px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#8a9a92;"">{WebUtility.HtmlEncode(vm.EmailLabel)}</p>
            <p style=""margin:0 0 20px;font-size:17px;font-weight:500;color:#1d2b24;word-break:break-all;"">{WebUtility.HtmlEncode(vm.Email)}</p>
          </td></tr>
          <tr><td style=""padding:0 24px 22px;"">
            <p style=""margin:0 0 8px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#8a9a92;"">{WebUtility.HtmlEncode(vm.PasswordLabel)}</p>
            <div style=""background:#f3f7f4;border:1px dashed rgba(38,86,64,0.34);border-radius:10px;padding:14px 18px;text-align:center;"">
              <span style=""font-family:'Courier New',monospace;font-size:22px;font-weight:700;letter-spacing:0.08em;color:#265640;"">{WebUtility.HtmlEncode(vm.Password)}</span>
            </div>
          </td></tr>
        </table>
        <table role=""presentation"" width=""100%"" cellspacing=""0"" cellpadding=""0"" border=""0"" style=""margin:20px 0 6px;background:rgba(255,110,80,0.08);border:1px solid rgba(255,110,80,0.28);border-radius:12px;"">
          <tr><td style=""padding:16px 20px;"">
            <p style=""margin:0 0 4px;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;font-weight:700;color:#c2543a;"">{WebUtility.HtmlEncode(vm.OneTimeBadge)}</p>
            <p style=""margin:0;font-size:14px;line-height:1.6;color:#5a4a42;"">{WebUtility.HtmlEncode(vm.OneTimeNote)}</p>
          </td></tr>
        </table>
        <div style=""text-align:center;margin:30px 0 8px;"">
          <a href=""{vm.LoginUrl}"" style=""display:inline-block;background-color:#ff6e50;background:linear-gradient(135deg,#ff6e50,#f98b73);color:#fff;text-decoration:none;font-size:16px;font-weight:600;padding:15px 40px;border-radius:10px;box-shadow:0 10px 24px rgba(255,110,80,0.32);"">{WebUtility.HtmlEncode(vm.Cta)}</a>
        </div>
        <table role=""presentation"" width=""100%"" cellspacing=""0"" cellpadding=""0"" border=""0"" style=""margin:26px 0 4px;""><tr>{steps}</tr></table>
        <p style=""margin:22px 0 6px;font-size:12.5px;line-height:1.6;color:#8a9a92;"">{WebUtility.HtmlEncode(vm.SecurityNote)}</p>
      </td></tr>
      <tr><td style=""padding:26px 40px;background:#f0ece9;border-top:1px solid rgba(38,86,64,0.1);text-align:center;"">
        <p style=""margin:0;font-size:12px;color:#8a9a92;"">© {year} Pavillon 46 — La Croix-sur-Lutry, Suisse</p>
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
