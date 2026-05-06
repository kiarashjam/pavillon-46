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

const EMAIL_FOOTER_NOTE =
  'Figures are aggregate first-party usage only (no Google Analytics or ad pixels). Referrers are domain names; click labels are shortened and scrubbed for accidental personal data.'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildPlainText(reportDay, summary, topPages, topClicks, topReferrers) {
  const pageRows = topPages.map((item) => `- ${item.path}: ${item.count}`).join('\n') || '- none'
  const clickRows = topClicks.map((item) => `- ${item.label}: ${item.count}`).join('\n') || '- none'
  const referrerRows = topReferrers.map((item) => `- ${item.referrer}: ${item.count}`).join('\n') || '- none'

  return [
    `Pavillon 46 - Daily Activity Report (${reportDay}, Europe/Zurich)`,
    '',
    `Total events: ${number(summary.totalEvents)}`,
    `Unique sessions: ${number(summary.uniqueSessions)}`,
    `Page views: ${number(summary.pageViews)}`,
    `Clicks: ${number(summary.clicks)}`,
    '',
    'Top pages (up to 8):',
    pageRows,
    '',
    'Top clicked elements (up to 8):',
    clickRows,
    '',
    'Top referring domains (up to 8):',
    referrerRows,
    '',
    EMAIL_FOOTER_NOTE,
  ].join('\n')
}

function buildHtml(reportDay, summary, topPages, topClicks, topReferrers) {
  const pageRows = topPages
    .map((item) => `<li><strong>${item.count}</strong> - <span>${escapeHtml(item.path)}</span></li>`)
    .join('')
  const clickRows = topClicks
    .map((item) => `<li><strong>${item.count}</strong> - <span>${escapeHtml(item.label)}</span></li>`)
    .join('')
  const referrerRows = topReferrers
    .map((item) => `<li><strong>${item.count}</strong> - <span>${escapeHtml(item.referrer)}</span></li>`)
    .join('')

  return `
  <div style="font-family: Arial, sans-serif; max-width: 760px; margin: 0 auto; color: #1f2d27;">
    <h2 style="margin-bottom: 4px;">Pavillon 46 Daily Activity Report</h2>
    <p style="margin-top: 0; color: #4d6a5d;">Day: <strong>${escapeHtml(reportDay)}</strong> (Europe/Zurich)</p>
    <div style="display: grid; grid-template-columns: repeat(2, minmax(220px, 1fr)); gap: 10px; margin: 16px 0;">
      <div style="padding: 10px; border: 1px solid #d8e2dc; border-radius: 8px;">Total events: <strong>${number(summary.totalEvents)}</strong></div>
      <div style="padding: 10px; border: 1px solid #d8e2dc; border-radius: 8px;">Unique sessions: <strong>${number(summary.uniqueSessions)}</strong></div>
      <div style="padding: 10px; border: 1px solid #d8e2dc; border-radius: 8px;">Page views: <strong>${number(summary.pageViews)}</strong></div>
      <div style="padding: 10px; border: 1px solid #d8e2dc; border-radius: 8px;">Clicks: <strong>${number(summary.clicks)}</strong></div>
    </div>
    <h3>Top pages (up to 8)</h3>
    <ul>${pageRows || '<li>none</li>'}</ul>
    <h3>Top clicked elements (up to 8)</h3>
    <ul>${clickRows || '<li>none</li>'}</ul>
    <h3>Top referring domains (up to 8)</h3>
    <ul>${referrerRows || '<li>none</li>'}</ul>
    <p style="margin-top: 20px; font-size: 12px; color: #5c6f66; line-height: 1.45;">${escapeHtml(EMAIL_FOOTER_NOTE)}</p>
  </div>
  `
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
  const subject = `Pavillon 46 Daily Activity Report - ${reportDay}`

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
