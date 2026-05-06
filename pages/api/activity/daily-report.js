import sgMail from '@sendgrid/mail'
import { getActivityReport, recordActivityEvent } from '../../../lib/activityStore'

const TZ = 'Europe/Zurich'

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)

  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  )
  return asUtc - date.getTime()
}

function localDateTimeToUtcIso(day, hour = 0, minute = 0, second = 0, millisecond = 0) {
  const [year, month, date] = day.split('-').map(Number)
  let utcGuess = Date.UTC(year, month - 1, date, hour, minute, second, millisecond)
  for (let i = 0; i < 4; i += 1) {
    const offset = getTimeZoneOffsetMs(new Date(utcGuess), TZ)
    utcGuess = Date.UTC(year, month - 1, date, hour, minute, second, millisecond) - offset
  }
  return new Date(utcGuess).toISOString()
}

function formatDayInZurich(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
}

function shiftDay(day, delta) {
  const pivot = new Date(`${day}T12:00:00.000Z`)
  pivot.setUTCDate(pivot.getUTCDate() + delta)
  return pivot.toISOString().slice(0, 10)
}

function resolveTargetDay(dayOverride) {
  if (typeof dayOverride === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dayOverride)) {
    return dayOverride
  }
  const todayZurich = formatDayInZurich(new Date())
  return shiftDay(todayZurich, -1)
}

function isAuthorized(req) {
  const expectedKey = process.env.ACTIVITY_REPORT_KEY || '1234'
  const providedKey = req.headers['x-report-key'] || req.headers['x-daily-report-key'] || req.query.key || ''
  return String(providedKey) === expectedKey
}

function number(value) {
  return new Intl.NumberFormat('en-CH').format(Number(value) || 0)
}

/** Calendar day label for Pierre (CH): long French date + ISO in parentheses */
function formatReportDayReadable(reportDay) {
  const iso = localDateTimeToUtcIso(reportDay, 12, 0, 0, 0)
  const longFr = new Intl.DateTimeFormat('fr-CH', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso))
  return `${longFr} (${reportDay})`
}

const EMAIL_FOOTER_NOTE =
  'Données agrégées uniquement, mesure first-party (pas Google Analytics ni publicité). Référents = noms de domaine ; libellés de clics raccourcis et filtrés.'

const EMAIL_FOOTER_NOTE_EN =
  'All figures are aggregated first-party usage (no Google Analytics or ad pixels). Referrers are domain names only; click labels are shortened and scrubbed.'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildRankedTableRows(items, labelKey, emptyLabel) {
  if (!items.length) {
    return `<tr><td colspan="2" style="padding:14px 16px;font-size:14px;color:#6b7f76;font-style:italic;border-bottom:1px solid #edf3f0;">${emptyLabel}</td></tr>`
  }
  return items
    .map(
      (item, i) => `
    <tr>
      <td style="padding:12px 16px;font-size:14px;color:#1f2d27;border-bottom:1px solid #edf3f0;vertical-align:middle;">
        <span style="display:inline-block;min-width:22px;color:#8aa399;font-size:12px;font-weight:700;">${i + 1}.</span>
        ${escapeHtml(item[labelKey])}
      </td>
      <td align="right" style="padding:12px 16px;font-size:14px;font-weight:700;color:#1f2d27;border-bottom:1px solid #edf3f0;white-space:nowrap;vertical-align:middle;">
        ${number(item.count)}
      </td>
    </tr>`
    )
    .join('')
}

function metricCell(title, subtitle, value) {
  return `
    <td width="50%" valign="top" style="padding:6px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f7faf8;border:1px solid #dce8e0;border-radius:14px;">
        <tr>
          <td style="padding:18px 20px;">
            <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#5c7a6e;">${title}</p>
            <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;color:#6b7f76;">${subtitle}</p>
            <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:700;line-height:1.05;color:#1f2d27;">${value}</p>
          </td>
        </tr>
      </table>
    </td>`
}

function buildPlainText(reportDay, summary, topPages, topClicks, topReferrers) {
  const readable = formatReportDayReadable(reportDay)
  const pageRows = topPages.map((item) => `  ${item.count}×  ${item.path}`).join('\n') || '  (none)'
  const clickRows = topClicks.map((item) => `  ${item.count}×  ${item.label}`).join('\n') || '  (none)'
  const referrerRows = topReferrers.map((item) => `  ${item.count}×  ${item.referrer}`).join('\n') || '  (none)'

  return [
    'PAVILLON 46 — Daily website summary',
    '────────────────────────────────────',
    '',
    `Period covered: ${readable}`,
    'Time zone for the day boundary: Europe/Zurich (calendar day 00:00–24:00).',
    '',
    'This email is an automatic snapshot of traffic on pavillon46.ch: how many people',
    'browsed, which pages were seen most, which buttons/links were used most, and',
    'which other sites sent visitors (domain only).',
    '',
    '── Key figures ──',
    `  All events logged     ${number(summary.totalEvents)}`,
    `    (page opens + tracked clicks; one visitor can generate several events)`,
    `  Estimated visitors    ${number(summary.uniqueSessions)}`,
    `    (approximate “sessions”, from an anonymous browser id)`,
    `  Page views            ${number(summary.pageViews)}`,
    `  Tracked clicks        ${number(summary.clicks)}`,
    `    (links & buttons; labels may be shortened)`,
    '',
    '── Top pages (max. 8) ──',
    '  Path on the site · number of views/events in that period',
    pageRows,
    '',
    '── Top clicks (max. 8) ──',
    '  Element label · how often it was clicked',
    clickRows,
    '',
    '── Top referring domains (max. 8) ──',
    '  External site hostname · visits that arrived with that referrer',
    referrerRows,
    '',
    '── Privacy note ──',
    `  ${EMAIL_FOOTER_NOTE_EN}`,
    `  ${EMAIL_FOOTER_NOTE}`,
    '',
    'Questions? Reply to this thread or write to contact@pavillon46.ch',
    '',
    '— Pavillon 46 (automated)',
  ].join('\n')
}

function buildHtml(reportDay, summary, topPages, topClicks, topReferrers) {
  const readable = formatReportDayReadable(reportDay)
  const preheader = `${number(summary.pageViews)} page views · ${number(summary.uniqueSessions)} sessions · ${readable}`

  const pageRows = buildRankedTableRows(topPages, 'path', 'No page data for this day.')
  const clickRows = buildRankedTableRows(topClicks, 'label', 'No click data for this day.')
  const referrerRows = buildRankedTableRows(topReferrers, 'referrer', 'No referrer data for this day.')

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>Daily activity</title>
</head>
<body style="margin:0;padding:0;background-color:#ebe8e4;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#ebe8e4;">
    <tr>
      <td align="center" style="padding:28px 16px 40px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
          <tr>
            <td bgcolor="#1f2d27" style="background:linear-gradient(135deg,#1f2d27 0%,#2d4a3c 100%);background-color:#1f2d27;border-radius:16px 16px 0 0;padding:28px 28px 24px;">
              <p style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#fcf8f7;letter-spacing:0.02em;">Pavillon 46</p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#b8d4c4;line-height:1.5;">Résumé d’activité du site · Daily activity summary</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#fcf8f7;padding:26px 28px 8px;border-left:1px solid #e0dcd8;border-right:1px solid #e0dcd8;">
              <p style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;color:#1f2d27;line-height:1.25;">${escapeHtml(readable)}</p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#4d5c54;">
                Automatic report for <strong>one calendar day</strong> in <strong>Europe/Zurich</strong> (midnight to midnight).
                It shows how the public site was used: traffic level, favourite pages, most-used controls, and where visits came from (domain only).
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#fcf8f7;padding:8px 16px 20px;border-left:1px solid #e0dcd8;border-right:1px solid #e0dcd8;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  ${metricCell(
                    'All events',
                    'Page views + tracked clicks',
                    number(summary.totalEvents)
                  )}
                  ${metricCell(
                    'Sessions',
                    'Approx. distinct browsers',
                    number(summary.uniqueSessions)
                  )}
                </tr>
                <tr>
                  ${metricCell(
                    'Page views',
                    'Route changes & loads',
                    number(summary.pageViews)
                  )}
                  ${metricCell(
                    'Clicks',
                    'Links & buttons',
                    number(summary.clicks)
                  )}
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:8px 28px 6px;border-left:1px solid #e0dcd8;border-right:1px solid #e0dcd8;">
              <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.11em;text-transform:uppercase;color:#5c7a6e;">Top pages</p>
              <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#6b7f76;">Most viewed paths on the site (up to 8).</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e5ebe7;border-radius:12px;overflow:hidden;">
                ${pageRows}
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:22px 28px 6px;border-left:1px solid #e0dcd8;border-right:1px solid #e0dcd8;">
              <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.11em;text-transform:uppercase;color:#5c7a6e;">Top clicks</p>
              <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#6b7f76;">Most clicked links and buttons; labels may be shortened for privacy.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e5ebe7;border-radius:12px;overflow:hidden;">
                ${clickRows}
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:22px 28px 24px;border-left:1px solid #e0dcd8;border-right:1px solid #e0dcd8;border-radius:0 0 16px 16px;border-bottom:1px solid #e0dcd8;">
              <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.11em;text-transform:uppercase;color:#5c7a6e;">Referring domains</p>
              <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#6b7f76;">Other websites that linked here (hostname only, no full URL).</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e5ebe7;border-radius:12px;overflow:hidden;">
                ${referrerRows}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:#eef4f1;border:1px solid #d4e3dc;border-radius:12px;">
                <tr>
                  <td style="padding:16px 20px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;color:#3d5248;">
                    <strong style="color:#1f2d27;">Privacy</strong> — ${escapeHtml(EMAIL_FOOTER_NOTE_EN)}<br><br>
                    <span style="color:#5c6f66;">${escapeHtml(EMAIL_FOOTER_NOTE)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#7a8f85;">
              Sent automatically · <a href="mailto:contact@pavillon46.ch" style="color:#2d5a45;text-decoration:underline;">contact@pavillon46.ch</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

export default async function handler(req, res) {
  if (!['POST', 'GET'].includes(req.method)) {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const reportDay = resolveTargetDay(req.query.day)
  const fromIso = localDateTimeToUtcIso(reportDay, 0, 0, 0, 0)
  const toIso = localDateTimeToUtcIso(reportDay, 23, 59, 59, 999)

  const markerPath = `/daily-report/${reportDay}`
  const markerReport = await getActivityReport({
    type: 'daily_report_sent',
    path: markerPath,
    limit: 5,
  })
  if ((markerReport.events || []).some((event) => event.path === markerPath)) {
    return res.status(200).json({ ok: true, skipped: 'already-sent', reportDay })
  }

  if (!process.env.SENDGRID_API_KEY || !process.env.FROM_EMAIL) {
    return res.status(500).json({
      message: 'Server configuration error',
      detail: 'Missing SENDGRID_API_KEY or FROM_EMAIL',
    })
  }

  const report = await getActivityReport({
    from: fromIso,
    to: toIso,
    type: 'all',
    limit: 50000,
  })

  const summary = report.summary || {
    totalEvents: 0,
    uniqueSessions: 0,
    pageViews: 0,
    clicks: 0,
    topPages: [],
    topClicks: [],
  }

  const referrerCounts = new Map()
  for (const event of report.events || []) {
    const ref = String(event.referrer || '').trim()
    if (!ref || ref === 'internal') continue
    referrerCounts.set(ref, (referrerCounts.get(ref) || 0) + 1)
  }
  const topReferrers = Array.from(referrerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([referrer, count]) => ({ referrer, count }))

  const toEmail = process.env.ACTIVITY_DAILY_REPORT_TO || 'pierre.boissart@pavillon46.ch'
  const fromName = process.env.FROM_NAME || 'Pavillon 46'
  const subject = `Pavillon 46 · Activité du site — ${formatReportDayReadable(reportDay)}`

  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
  await sgMail.send({
    to: toEmail,
    from: { email: process.env.FROM_EMAIL, name: fromName },
    subject,
    text: buildPlainText(reportDay, summary, summary.topPages || [], summary.topClicks || [], topReferrers),
    html: buildHtml(reportDay, summary, summary.topPages || [], summary.topClicks || [], topReferrers),
  })

  await recordActivityEvent({
    type: 'daily_report_sent',
    path: markerPath,
    sessionId: `cron-${reportDay}`,
    ts: new Date().toISOString(),
    userAgent: 'internal-daily-report-job',
    referrer: 'internal',
    ipHash: 'internal',
    element: { tag: 'system', id: 'daily-report', text: toEmail },
  })

  return res.status(200).json({
    ok: true,
    reportDay,
    to: toEmail,
    totals: {
      totalEvents: summary.totalEvents || 0,
      uniqueSessions: summary.uniqueSessions || 0,
      pageViews: summary.pageViews || 0,
      clicks: summary.clicks || 0,
    },
  })
}
