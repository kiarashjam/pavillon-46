using System.Net;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Localization;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public interface IMeetingEmailService
{
    /// <summary>"Nouveau rendez-vous" to each notification address. Never throws.</summary>
    Task NotifyTeamAsync(MeetingBooking booking, IReadOnlyList<string> recipients, CancellationToken ct = default);

    /// <summary>The booking confirmation, in the person's language. Never throws; false when it was not sent.</summary>
    Task<bool> SendConfirmationAsync(MeetingBooking booking, CancellationToken ct = default);

    /// <summary>A short note that the team cancelled the meeting. Never throws; false when it was not sent.</summary>
    Task<bool> SendCancellationAsync(MeetingBooking booking, CancellationToken ct = default);
}

/// <summary>
/// The meeting emails, sent through <see cref="IEmailService"/> (SendGrid).
/// Inline styles only, every value a person typed HTML-encoded. A failure is
/// logged, never thrown: the booking is saved either way.
/// </summary>
public class MeetingEmailService : IMeetingEmailService
{
    public const string ContactEmail = "info@pavillon46.ch";

    private readonly IEmailService _email;
    private readonly SiteOptions _site;
    private readonly ILogger<MeetingEmailService> _logger;

    public MeetingEmailService(IEmailService email, IOptions<SiteOptions> site, ILogger<MeetingEmailService> logger)
    {
        _email = email;
        _site = site.Value;
        _logger = logger;
    }

    private static string E(string? value) => WebUtility.HtmlEncode(value ?? "");

    private static (DateOnly Date, string Start, string End) When(MeetingBooking b)
    {
        MeetingCalendar.TryParseDate(b.Date, out var date);
        MeetingCalendar.TryParseTime(b.Time, out var start);
        return (date, MeetingCalendar.FormatTime(start), MeetingCalendar.FormatTime(start.AddMinutes(b.DurationMinutes)));
    }

    public async Task NotifyTeamAsync(MeetingBooking booking, IReadOnlyList<string> recipients, CancellationToken ct = default)
    {
        if (recipients.Count == 0) return;
        if (!_email.IsConfigured)
        {
            _logger.LogWarning("meetings.email.team_skipped booking={Booking} reason=sendgrid_not_configured", booking.Id);
            return;
        }

        var t = EmailTranslations.MeetingTeam();
        var (date, start, end) = When(booking);
        var dateText = EmailTranslations.MeetingDate(date, "fr");
        var name = $"{booking.FirstName} {booking.LastName}".Trim();
        var origin = booking.FromInvitation() ? t.FromInvitation(booking.Code) : t.Direct;
        var language = booking.Language == "en" ? "Anglais" : "Français";
        var duration = EmailTranslations.MeetingConfirmation("fr").Duration(booking.DurationMinutes);
        var subject = t.Subject(name, $"{dateText} à {start}");
        var adminUrl = _site.Page("admin/meetings");

        var rows = new List<(string Label, string Html, string Plain)>
        {
            (t.NameLabel, $"<strong>{E(name)}</strong>", name),
            (t.EmailLabel, $@"<a href=""mailto:{E(booking.Email)}"" style=""color:#265640;"">{E(booking.Email)}</a>", booking.Email),
            (t.PhoneLabel, $@"<a href=""tel:{E(new string(booking.Phone.Where(c => char.IsAsciiDigit(c) || c == '+').ToArray()))}"" style=""color:#265640;"">{E(booking.Phone)}</a>", booking.Phone),
            (t.DateLabel, E(dateText), dateText),
            (t.TimeLabel, $"{E(start)} – {E(end)}", $"{start} – {end}"),
            (t.DurationLabel, E(duration), duration),
            (t.OriginLabel, E(origin), origin),
            (t.LanguageLabel, E(language), language),
        };
        if (!string.IsNullOrWhiteSpace(booking.Message))
            rows.Add((t.MessageLabel, E(booking.Message).Replace("\n", "<br/>"), booking.Message));

        var plain = $"{t.Heading}\n\n{t.Intro}\n\n"
            + string.Join("\n", rows.Select(r => $"{r.Label} : {r.Plain}"))
            + $"\n\n{t.Cta} : {adminUrl}";

        var table = string.Concat(rows.Select(r =>
            $@"<tr><td style=""padding:11px 14px;border-bottom:1px solid rgba(38,86,64,0.1);width:32%;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6f8079;vertical-align:top;"">{E(r.Label)}</td><td style=""padding:11px 14px;border-bottom:1px solid rgba(38,86,64,0.1);font-size:15px;color:#1d2b24;line-height:1.6;"">{r.Html}</td></tr>"));

        var html = Frame("fr", t.Heading, "Pavillon 46 · Rendez-vous", t.Heading, $@"
        <p style=""margin:0 0 20px;font-size:16px;line-height:1.7;color:#3a4a42;"">{E(t.Intro)}</p>
        <table role=""presentation"" width=""100%"" cellspacing=""0"" cellpadding=""0"" border=""0"" style=""background:#fff;border:1px solid rgba(38,86,64,0.14);border-radius:12px;border-collapse:separate;overflow:hidden;"">{table}</table>
        <div style=""text-align:center;margin:28px 0 6px;"">
          <a href=""{E(adminUrl)}"" style=""display:inline-block;background:#265640;color:#fff;text-decoration:none;font-size:15px;font-weight:500;padding:13px 30px;border-radius:999px;"">{E(t.Cta)}</a>
        </div>");

        foreach (var to in recipients)
        {
            try
            {
                await _email.SendRawEmailAsync(to, subject, plain, html, ct);
            }
            catch (Exception ex)
            {
                _logger.LogError("meetings.email.team_failed booking={Booking} error={Error}", booking.Id, ex.GetType().Name);
            }
        }
    }

    public async Task<bool> SendConfirmationAsync(MeetingBooking booking, CancellationToken ct = default)
    {
        if (!_email.IsConfigured)
        {
            _logger.LogWarning("meetings.email.confirmation_skipped booking={Booking} reason=sendgrid_not_configured", booking.Id);
            return false;
        }

        var lang = EmailTranslations.NormalizeLang(booking.Language);
        var t = EmailTranslations.MeetingConfirmation(lang);
        var (date, start, end) = When(booking);
        var dateText = EmailTranslations.MeetingDate(date, lang);
        var timeText = t.TimeValue(start, end);
        var duration = t.Duration(booking.DurationMinutes);
        var heading = t.Heading(booking.FirstName);

        var details = new List<(string Label, string Value)>
        {
            (t.DateLabel, Capitalise(dateText)),
            (t.TimeLabel, timeText),
            (t.DurationLabel, duration),
            (t.PlaceLabel, t.Address),
        };
        if (!string.IsNullOrWhiteSpace(booking.Code)) details.Add((t.CodeLabel, booking.Code));

        var plain = $"{heading}\n\n{t.Intro}\n\n"
            // French sets a space before the colon; English does not.
            + string.Join("\n", details.Select(d => lang == "en" ? $"{d.Label}: {d.Value}" : $"{d.Label} : {d.Value}"))
            + $"\n\n{t.Contact} {ContactEmail}\n\n{t.Closing}\n{t.Team}";

        var rows = string.Concat(details.Select((d, i) =>
            $@"<tr><td style=""padding:14px 22px;{(i > 0 ? "border-top:1px solid rgba(38,86,64,0.1);" : "")}"">
              <p style=""margin:0 0 4px;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#8a9a92;"">{E(d.Label)}</p>
              <p style=""margin:0;font-size:17px;font-weight:400;color:#1d2b24;line-height:1.45;"">{E(d.Value)}</p>
            </td></tr>"));

        var html = Frame(lang, heading, t.Eyebrow, heading, $@"
        <p style=""margin:0 0 24px;font-size:16px;line-height:1.75;color:#3a4a42;"">{E(t.Intro)}</p>
        <table role=""presentation"" width=""100%"" cellspacing=""0"" cellpadding=""0"" border=""0"" style=""background:#fff;border:1px solid rgba(38,86,64,0.14);border-left:3px solid #ff6e50;border-radius:12px;border-collapse:separate;"">{rows}</table>
        <p style=""margin:26px 0 0;font-size:15px;line-height:1.7;color:#3a4a42;"">{E(t.Contact)} <a href=""mailto:{ContactEmail}"" style=""color:#265640;font-weight:500;"">{ContactEmail}</a>.</p>
        <p style=""margin:26px 0 4px;font-size:15px;color:#3a4a42;"">{E(t.Closing)}</p>
        <p style=""margin:0;font-size:16px;color:#265640;font-weight:500;"">{E(t.Team)}</p>");

        try
        {
            await _email.SendRawEmailAsync(booking.Email, t.Subject($"{dateText}, {start}"), plain, html, ct);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError("meetings.email.confirmation_failed booking={Booking} error={Error}", booking.Id, ex.GetType().Name);
            return false;
        }
    }

    public async Task<bool> SendCancellationAsync(MeetingBooking booking, CancellationToken ct = default)
    {
        if (!_email.IsConfigured)
        {
            _logger.LogWarning("meetings.email.cancellation_skipped booking={Booking} reason=sendgrid_not_configured", booking.Id);
            return false;
        }

        var lang = EmailTranslations.NormalizeLang(booking.Language);
        var t = EmailTranslations.MeetingCancellation(lang);
        var (date, start, _) = When(booking);
        var when = lang == "en"
            ? $"{EmailTranslations.MeetingDate(date, lang)} at {start}"
            : $"{EmailTranslations.MeetingDate(date, lang)} à {start}";
        var name = string.IsNullOrWhiteSpace(booking.FirstName) ? booking.Email : booking.FirstName;
        var body = t.Body(name, when);
        var url = _site.Page(lang == "en" ? "en/meeting" : "rendez-vous");

        var plain = $"{t.Heading}\n\n{body}\n\n{t.Body2}\n\n{t.Cta}{(lang == "en" ? ":" : " :")} {url}\n\n{t.Contact} {ContactEmail}";
        var html = Frame(lang, t.Heading, "Pavillon 46", t.Heading, $@"
        <p style=""margin:0 0 18px;font-size:16px;line-height:1.75;color:#3a4a42;"">{E(body)}</p>
        <p style=""margin:0 0 26px;font-size:16px;line-height:1.75;color:#3a4a42;"">{E(t.Body2)}</p>
        <div style=""text-align:center;margin:8px 0;"">
          <a href=""{E(url)}"" style=""display:inline-block;background:#ff6e50;color:#fff;text-decoration:none;font-size:16px;font-weight:500;padding:14px 34px;border-radius:999px;"">{E(t.Cta)}</a>
        </div>
        <p style=""margin:26px 0 0;font-size:14px;line-height:1.7;color:#6f8079;text-align:center;"">{E(t.Contact)} <a href=""mailto:{ContactEmail}"" style=""color:#265640;"">{ContactEmail}</a></p>");

        try
        {
            await _email.SendRawEmailAsync(booking.Email, t.Subject(when), plain, html, ct);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError("meetings.email.cancellation_failed booking={Booking} error={Error}", booking.Id, ex.GetType().Name);
            return false;
        }
    }

    private static string Capitalise(string s) => s.Length == 0 ? s : char.ToUpperInvariant(s[0]) + s[1..];

    /// <summary>The club's email frame: deep green surround, cream card, logo, eyebrow, light heading, coral rule.</summary>
    private string Frame(string lang, string title, string eyebrow, string heading, string content)
    {
        var logo = _site.Page("images/logo.png");
        var year = DateTime.UtcNow.Year;
        var place = lang == "en" ? "La Croix-sur-Lutry, Switzerland" : "La Croix-sur-Lutry, Suisse";
        return $@"<!DOCTYPE html>
<html lang=""{lang}"">
<head><meta charset=""UTF-8""><meta name=""viewport"" content=""width=device-width,initial-scale=1.0""><title>{E(title)}</title></head>
<body style=""margin:0;padding:0;background:#0e271e;font-family:Jost,'Helvetica Neue',Arial,sans-serif;color:#1d2b24;"">
  <table role=""presentation"" width=""100%"" cellspacing=""0"" cellpadding=""0"" border=""0"" style=""background:#0e271e;padding:32px 0;""><tr><td align=""center"" style=""padding:0 12px;"">
    <table role=""presentation"" width=""600"" cellspacing=""0"" cellpadding=""0"" border=""0"" style=""max-width:600px;width:100%;background:#fcf8f7;border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.35);"">
      <tr><td style=""background-color:#15362a;background:linear-gradient(135deg,#1f4a39 0%,#15362a 60%,#0e271e 100%);padding:44px 36px 38px;text-align:center;"">
        <img src=""{logo}"" alt=""Pavillon 46"" width=""148"" style=""display:inline-block;max-width:148px;width:100%;height:auto;filter:brightness(0) invert(1);opacity:.96;margin-bottom:22px;""/>
        <p style=""margin:0 0 10px;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:#e0bffc;font-weight:600;"">{E(eyebrow)}</p>
        <h1 style=""margin:0;font-size:30px;line-height:1.2;font-weight:300;color:#fff;letter-spacing:0.01em;"">{E(heading)}</h1>
        <div style=""width:46px;height:2px;background:#ff6e50;margin:18px auto 0;border-radius:2px;""></div>
      </td></tr>
      <tr><td style=""padding:36px 36px 34px;"">{content}
      </td></tr>
      <tr><td style=""padding:24px 36px;background:#f0ece9;border-top:1px solid rgba(38,86,64,0.1);text-align:center;"">
        <p style=""margin:0;font-size:12px;color:#8a9a92;line-height:1.7;"">© {year} Pavillon 46 — {E(place)}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>";
    }
}
