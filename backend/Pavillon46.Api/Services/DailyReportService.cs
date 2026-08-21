using System.Globalization;
using System.Net;
using System.Text;
using Microsoft.Extensions.Options;
using Pavillon46.Api.Models;

namespace Pavillon46.Api.Services;

public class DailyReportService : IDailyReportService
{
    private static readonly TimeZoneInfo Zurich = ResolveZurich();

    private static TimeZoneInfo ResolveZurich()
    {
        if (TimeZoneInfo.TryFindSystemTimeZoneById("Europe/Zurich", out var tz)) return tz;
        return TimeZoneInfo.FindSystemTimeZoneById("W. Europe Standard Time");
    }

    private const string EmailFooterNoteFr =
        "Données agrégées uniquement, mesure first-party (pas Google Analytics ni publicité). Référents = noms de domaine ; libellés de clics raccourcis et filtrés. Aucune suppression des journaux d’activité ni impact sur le site public : seule une ligne de confirmation « rapport envoyé » est ajoutée.";

    private const string EmailFooterNoteEn =
        "All figures are aggregated first-party usage (no Google Analytics or ad pixels). Referrers are domain names only; click labels are shortened and scrubbed. Sending this email does not delete any activity logs or reset the website; only a small internal “report sent” marker is stored.";

    private readonly IActivityStore _store;
    private readonly IEmailService _email;
    private readonly ActivityOptions _activity;
    private readonly SendGridOptions _sendgrid;
    private readonly ILogger<DailyReportService> _logger;

    public DailyReportService(
        IActivityStore store,
        IEmailService email,
        IOptions<ActivityOptions> activity,
        IOptions<SendGridOptions> sendgrid,
        ILogger<DailyReportService> logger)
    {
        _store = store;
        _email = email;
        _activity = activity.Value;
        _sendgrid = sendgrid.Value;
        _logger = logger;
    }

    private static string FormatDayInZurich(DateTime instant)
    {
        var zurich = TimeZoneInfo.ConvertTimeFromUtc(instant.ToUniversalTime(), Zurich);
        return zurich.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    private static string LocalDateToUtcIso(string day, int hour, int minute, int second, int millisecond)
    {
        var parts = day.Split('-').Select(int.Parse).ToArray();
        var local = new DateTime(parts[0], parts[1], parts[2], hour, minute, second, millisecond, DateTimeKind.Unspecified);
        var utc = TimeZoneInfo.ConvertTimeToUtc(local, Zurich);
        return utc.ToString("o", CultureInfo.InvariantCulture);
    }

    private static string ResolveTargetDay(string? overrideDay)
    {
        if (!string.IsNullOrEmpty(overrideDay) &&
            System.Text.RegularExpressions.Regex.IsMatch(overrideDay, @"^\d{4}-\d{2}-\d{2}$"))
        {
            return overrideDay;
        }
        var now = DateTime.UtcNow;
        var todayZurich = FormatDayInZurich(now);
        var zurichNow = TimeZoneInfo.ConvertTimeFromUtc(now, Zurich);
        var hour = zurichNow.Hour;
        if (hour == 23) return todayZurich;
        return TimeZoneInfo.ConvertTimeFromUtc(now, Zurich).AddDays(-1).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    private static string FormatReportDayReadable(string reportDay)
    {
        var parts = reportDay.Split('-').Select(int.Parse).ToArray();
        var d = new DateTime(parts[0], parts[1], parts[2]);
        var fr = new CultureInfo("fr-CH");
        var longFr = d.ToString("dddd d MMMM yyyy", fr);
        return $"{longFr} ({reportDay})";
    }

    private static string FormatNumber(int n) => n.ToString("N0", CultureInfo.InvariantCulture);

    public async Task<DailyReportResult> SendAsync(string? dayOverride, CancellationToken ct = default)
    {
        var reportDay = ResolveTargetDay(dayOverride);
        var fromIso = LocalDateToUtcIso(reportDay, 0, 0, 0, 0);
        var toIso = LocalDateToUtcIso(reportDay, 23, 59, 59, 999);

        var markerPath = $"/daily-report/{reportDay}";
        var markerReport = await _store.GetReportAsync(new ActivityReportFilters
        {
            Type = "daily_report_sent",
            Path = markerPath,
            Limit = 5
        }, ct);

        if (markerReport.Events.Any(e => e.Path == markerPath))
        {
            return new DailyReportResult(true, "already-sent", reportDay, null, true, 0, 0, 0, 0);
        }

        if (!_sendgrid.IsConfigured())
        {
            throw new InvalidOperationException("Missing SENDGRID_API_KEY or FROM_EMAIL");
        }

        var report = await _store.GetReportAsync(new ActivityReportFilters
        {
            From = fromIso,
            To = toIso,
            Type = "all",
            Limit = 50000
        }, ct);

        var summary = report.Summary;
        var referrerCounts = new Dictionary<string, int>();
        foreach (var ev in report.Events)
        {
            var r = (ev.Referrer ?? "").Trim();
            if (string.IsNullOrEmpty(r) || r == "internal") continue;
            referrerCounts[r] = referrerCounts.GetValueOrDefault(r) + 1;
        }
        var topReferrers = referrerCounts.OrderByDescending(p => p.Value).Take(8)
            .Select(p => new RankedReferrer(p.Key, p.Value)).ToList();

        var toEmail = string.IsNullOrWhiteSpace(_activity.DailyReportTo)
            ? "pierre.boissart@pavillon46.ch" : _activity.DailyReportTo;
        var subject = $"Pavillon 46 · Activité du site — {FormatReportDayReadable(reportDay)}";

        var plain = BuildPlainText(reportDay, summary, topReferrers);
        var html = BuildHtml(reportDay, summary, topReferrers);

        await _email.SendRawEmailAsync(toEmail, subject, plain, html, ct);

        await _store.RecordEventAsync(new ActivityEvent
        {
            Type = "daily_report_sent",
            Path = markerPath,
            SessionId = $"cron-{reportDay}",
            Ts = DateTime.UtcNow.ToString("o"),
            UserAgent = "internal-daily-report-job",
            Referrer = "internal",
            IpHash = "internal",
            Element = new ActivityElement { Tag = "system", Id = "daily-report", Text = toEmail }
        }, ct);

        return new DailyReportResult(
            true, null, reportDay, toEmail, true,
            summary.TotalEvents, summary.UniqueSessions, summary.PageViews, summary.Clicks);
    }

    private string BuildPlainText(string reportDay, ActivitySummary s, List<RankedReferrer> topReferrers)
    {
        var sb = new StringBuilder();
        sb.AppendLine("PAVILLON 46 — Daily website summary");
        sb.AppendLine("────────────────────────────────────");
        sb.AppendLine();
        sb.AppendLine($"Period covered: {FormatReportDayReadable(reportDay)}");
        sb.AppendLine("Time zone for the day boundary: Europe/Zurich (calendar day 00:00–24:00).");
        sb.AppendLine();
        sb.AppendLine("This email is an automatic snapshot of traffic on pavillon46.ch.");
        sb.AppendLine();
        sb.AppendLine("── Key figures ──");
        sb.AppendLine($"  All events logged     {FormatNumber(s.TotalEvents)}");
        sb.AppendLine($"  Estimated visitors    {FormatNumber(s.UniqueSessions)}");
        sb.AppendLine($"  Page views            {FormatNumber(s.PageViews)}");
        sb.AppendLine($"  Tracked clicks        {FormatNumber(s.Clicks)}");
        sb.AppendLine();
        sb.AppendLine("── Top pages (max. 8) ──");
        sb.AppendLine(s.TopPages.Count == 0 ? "  (none)" : string.Join('\n', s.TopPages.Select(p => $"  {FormatNumber(p.Count)}×  {p.Path}")));
        sb.AppendLine();
        sb.AppendLine("── Top clicks (max. 8) ──");
        sb.AppendLine(s.TopClicks.Count == 0 ? "  (none)" : string.Join('\n', s.TopClicks.Select(p => $"  {FormatNumber(p.Count)}×  {p.Label}")));
        sb.AppendLine();
        sb.AppendLine("── Top referring domains (max. 8) ──");
        sb.AppendLine(topReferrers.Count == 0 ? "  (none)" : string.Join('\n', topReferrers.Select(p => $"  {FormatNumber(p.Count)}×  {p.Referrer}")));
        sb.AppendLine();
        sb.AppendLine("── Privacy & data retention ──");
        sb.AppendLine($"  {EmailFooterNoteEn}");
        sb.AppendLine($"  {EmailFooterNoteFr}");
        sb.AppendLine();
        sb.AppendLine("— Pavillon 46 (automated)");
        return sb.ToString();
    }

    private string BuildHtml(string reportDay, ActivitySummary s, List<RankedReferrer> topReferrers)
    {
        string Rows(IEnumerable<(string label, int count)> items, string emptyText) =>
            items.Any()
                ? string.Concat(items.Select((it, i) =>
                    $"<tr><td style=\"padding:12px 16px;font-size:14px;color:#1f2d27;border-bottom:1px solid #edf3f0;vertical-align:middle;\"><span style=\"display:inline-block;min-width:22px;color:#8aa399;font-size:12px;font-weight:700;\">{i + 1}.</span>{WebUtility.HtmlEncode(it.label)}</td><td align=\"right\" style=\"padding:12px 16px;font-size:14px;font-weight:700;color:#1f2d27;border-bottom:1px solid #edf3f0;white-space:nowrap;vertical-align:middle;\">{FormatNumber(it.count)}</td></tr>"))
                : $"<tr><td colspan=\"2\" style=\"padding:14px 16px;font-size:14px;color:#6b7f76;font-style:italic;border-bottom:1px solid #edf3f0;\">{emptyText}</td></tr>";

        string Metric(string title, string subtitle, string value) =>
            $"<td width=\"50%\" valign=\"top\" style=\"padding:6px;\"><table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"background:#f7faf8;border:1px solid #dce8e0;border-radius:14px;\"><tr><td style=\"padding:18px 20px;\"><p style=\"margin:0 0 4px;font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#5c7a6e;\">{title}</p><p style=\"margin:0 0 10px;font-family:Arial,sans-serif;font-size:12px;line-height:1.4;color:#6b7f76;\">{subtitle}</p><p style=\"margin:0;font-family:Georgia,serif;font-size:28px;font-weight:700;line-height:1.05;color:#1f2d27;\">{value}</p></td></tr></table></td>";

        var readable = FormatReportDayReadable(reportDay);
        var preheader = $"{FormatNumber(s.PageViews)} page views · {FormatNumber(s.UniqueSessions)} sessions · {readable}";

        var pageRows = Rows(s.TopPages.Select(p => (p.Path, p.Count)), "No page data for this day.");
        var clickRows = Rows(s.TopClicks.Select(p => (p.Label, p.Count)), "No click data for this day.");
        var referrerRows = Rows(topReferrers.Select(p => (p.Referrer, p.Count)), "No referrer data for this day.");

        return $@"<!DOCTYPE html>
<html lang=""fr"">
<head><meta charset=""utf-8""><meta name=""viewport"" content=""width=device-width""><title>Daily activity</title></head>
<body style=""margin:0;padding:0;background:#ebe8e4;"">
<div style=""display:none;max-height:0;overflow:hidden;mso-hide:all;"">{WebUtility.HtmlEncode(preheader)}</div>
<table role=""presentation"" width=""100%"" cellspacing=""0"" cellpadding=""0"" border=""0"" style=""background:#ebe8e4;""><tr><td align=""center"" style=""padding:28px 16px 40px;""><table role=""presentation"" width=""100%"" cellspacing=""0"" cellpadding=""0"" border=""0"" style=""max-width:600px;"">
<tr><td bgcolor=""#1f2d27"" style=""background:linear-gradient(135deg,#1f2d27 0%,#2d4a3c 100%);background-color:#1f2d27;border-radius:16px 16px 0 0;padding:28px 28px 24px;""><p style=""margin:0 0 6px;font-family:Georgia,serif;font-size:22px;font-weight:700;color:#fcf8f7;letter-spacing:.02em;"">Pavillon 46</p><p style=""margin:0;font-family:Arial,sans-serif;font-size:13px;color:#b8d4c4;line-height:1.5;"">Résumé d’activité du site · Daily activity summary</p></td></tr>
<tr><td style=""background:#fcf8f7;padding:26px 28px 8px;border-left:1px solid #e0dcd8;border-right:1px solid #e0dcd8;""><p style=""margin:0 0 8px;font-family:Georgia,serif;font-size:20px;font-weight:700;color:#1f2d27;line-height:1.25;"">{WebUtility.HtmlEncode(readable)}</p><p style=""margin:0;font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#4d5c54;"">Automatic report for <strong>one calendar day</strong> in <strong>Europe/Zurich</strong> (midnight to midnight).</p></td></tr>
<tr><td style=""background:#fcf8f7;padding:8px 16px 20px;border-left:1px solid #e0dcd8;border-right:1px solid #e0dcd8;""><table role=""presentation"" width=""100%"" cellspacing=""0"" cellpadding=""0"" border=""0"">
<tr>{Metric("All events", "Page views + tracked clicks", FormatNumber(s.TotalEvents))}{Metric("Sessions", "Approx. distinct browsers", FormatNumber(s.UniqueSessions))}</tr>
<tr>{Metric("Page views", "Route changes & loads", FormatNumber(s.PageViews))}{Metric("Clicks", "Links & buttons", FormatNumber(s.Clicks))}</tr>
</table></td></tr>
<tr><td style=""background:#fff;padding:8px 28px 6px;border-left:1px solid #e0dcd8;border-right:1px solid #e0dcd8;""><p style=""margin:0 0 4px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:#5c7a6e;"">Top pages</p><p style=""margin:0 0 12px;font-family:Arial,sans-serif;font-size:13px;line-height:1.45;color:#6b7f76;"">Most viewed paths on the site (up to 8).</p><table role=""presentation"" width=""100%"" cellspacing=""0"" cellpadding=""0"" border=""0"" style=""border:1px solid #e5ebe7;border-radius:12px;overflow:hidden;"">{pageRows}</table></td></tr>
<tr><td style=""background:#fff;padding:22px 28px 6px;border-left:1px solid #e0dcd8;border-right:1px solid #e0dcd8;""><p style=""margin:0 0 4px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:#5c7a6e;"">Top clicks</p><p style=""margin:0 0 12px;font-family:Arial,sans-serif;font-size:13px;line-height:1.45;color:#6b7f76;"">Most clicked links and buttons; labels may be shortened for privacy.</p><table role=""presentation"" width=""100%"" cellspacing=""0"" cellpadding=""0"" border=""0"" style=""border:1px solid #e5ebe7;border-radius:12px;overflow:hidden;"">{clickRows}</table></td></tr>
<tr><td style=""background:#fff;padding:22px 28px 24px;border-left:1px solid #e0dcd8;border-right:1px solid #e0dcd8;border-radius:0 0 16px 16px;border-bottom:1px solid #e0dcd8;""><p style=""margin:0 0 4px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:#5c7a6e;"">Referring domains</p><p style=""margin:0 0 12px;font-family:Arial,sans-serif;font-size:13px;line-height:1.45;color:#6b7f76;"">Other websites that linked here (hostname only).</p><table role=""presentation"" width=""100%"" cellspacing=""0"" cellpadding=""0"" border=""0"" style=""border:1px solid #e5ebe7;border-radius:12px;overflow:hidden;"">{referrerRows}</table></td></tr>
<tr><td style=""padding:20px 8px 0;""><table role=""presentation"" width=""100%"" cellspacing=""0"" cellpadding=""0"" border=""0"" style=""max-width:600px;background:#eef4f1;border:1px solid #d4e3dc;border-radius:12px;""><tr><td style=""padding:16px 20px;font-family:Arial,sans-serif;font-size:12px;line-height:1.55;color:#3d5248;""><strong style=""color:#1f2d27;"">Privacy &amp; data retention</strong> — {WebUtility.HtmlEncode(EmailFooterNoteEn)}<br><br><span style=""color:#5c6f66;"">{WebUtility.HtmlEncode(EmailFooterNoteFr)}</span></td></tr></table></td></tr>
<tr><td align=""center"" style=""padding:20px 16px 0;font-family:Arial,sans-serif;font-size:12px;color:#7a8f85;"">Sent automatically · <a href=""mailto:contact@pavillon46.ch"" style=""color:#2d5a45;text-decoration:underline;"">contact@pavillon46.ch</a></td></tr>
</table></td></tr></table></body></html>";
    }
}
