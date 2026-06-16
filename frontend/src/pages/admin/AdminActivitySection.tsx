import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { fetchActivityReport, type ActivityReportDto } from '../../lib/api'
import type { AdminCtx } from '../../components/admin/AdminLayout'

type RangeKey = '24h' | '7d' | '30d' | '90d' | 'all'
const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '24h', label: '24 h', days: 1 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
  { key: 'all', label: 'All time', days: null },
]

// --- user-agent parsing (the UA is kept ~140 chars; referrer is host-only) ---
function parseUA(ua: string) {
  const s = ua || ''
  let device: 'Mobile' | 'Tablet' | 'Desktop' | 'Unknown' = s ? 'Desktop' : 'Unknown'
  if (/iPad|Tablet/i.test(s)) device = 'Tablet'
  else if (/iPhone|iPod|Mobi|Android.*Mobile/i.test(s)) device = 'Mobile'
  else if (/Android/i.test(s)) device = 'Tablet'
  let browser = 'Other'
  if (/Edg\//i.test(s)) browser = 'Edge'
  else if (/OPR\/|Opera/i.test(s)) browser = 'Opera'
  else if (/Firefox\//i.test(s)) browser = 'Firefox'
  else if (/Chrome\//i.test(s)) browser = 'Chrome'
  else if (/Safari\//i.test(s) && /Version\//i.test(s)) browser = 'Safari'
  else if (!s) browser = 'Unknown'
  let os = 'Other'
  if (/Windows/i.test(s)) os = 'Windows'
  else if (/iPhone|iPad|iPod|iOS/i.test(s)) os = 'iOS'
  else if (/Mac OS X|Macintosh/i.test(s)) os = 'macOS'
  else if (/Android/i.test(s)) os = 'Android'
  else if (/Linux/i.test(s)) os = 'Linux'
  else if (!s) os = 'Unknown'
  return { device, browser, os }
}

function topN(map: Map<string, number>, n: number) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([label, count]) => ({ label, count }))
}

export default function AdminActivitySection() {
  const { token } = useOutletContext<AdminCtx>()
  const [range, setRange] = useState<RangeKey>('30d')
  const [type, setType] = useState<'all' | 'page_view' | 'click'>('all')
  const [path, setPath] = useState('')
  const [report, setReport] = useState<ActivityReportDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [howOpen, setHowOpen] = useState(false)
  const reqId = useRef(0)

  const runReport = async (opts?: { range?: RangeKey; type?: typeof type; path?: string }) => {
    const r = opts?.range ?? range
    const t = opts?.type ?? type
    const p = opts?.path ?? path
    const days = RANGES.find((x) => x.key === r)?.days ?? null
    const from = days ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined
    const id = ++reqId.current // only the latest request may write state
    setLoading(true); setError(null)
    try {
      const data = await fetchActivityReport({
        token,
        from,
        type: t === 'all' ? undefined : t,
        path: p || undefined,
        limit: 5000,
      })
      if (id === reqId.current) setReport(data)
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : 'Failed to load report')
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }
  useEffect(() => {
    void runReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const pickRange = (r: RangeKey) => { setRange(r); void runReport({ range: r }) }

  // --- derived analytics, computed from the loaded events ---
  const a = useMemo(() => {
    const events = report?.events ?? []
    const sessions = new Map<string, { count: number; pages: number; clicks: number; first: number; last: number }>()
    const day = new Map<string, { pv: number; clk: number }>()
    const hours = new Array(24).fill(0) as number[]
    const weekday = new Array(7).fill(0) as number[]
    const devices = new Map<string, number>()
    const browsers = new Map<string, number>()
    const os = new Map<string, number>()
    const referrers = new Map<string, number>()
    const pages = new Map<string, number>()
    const clicks = new Map<string, number>()
    const visitors = new Set<string>()
    let pv = 0, clk = 0

    for (const e of events) {
      const t = new Date(e.ts).getTime()
      const valid = !Number.isNaN(t)
      if (e.type === 'page_view') pv++
      else if (e.type === 'click') clk++
      if (e.ipHash) visitors.add(e.ipHash)

      if (e.sessionId) {
        const s = sessions.get(e.sessionId) ?? { count: 0, pages: 0, clicks: 0, first: Number.POSITIVE_INFINITY, last: Number.NEGATIVE_INFINITY }
        s.count++
        if (e.type === 'page_view') s.pages++
        if (e.type === 'click') s.clicks++
        if (valid) { s.first = Math.min(s.first, t); s.last = Math.max(s.last, t) }
        sessions.set(e.sessionId, s)
      }
      if (valid) {
        const d = new Date(t)
        const key = e.ts.slice(0, 10)
        const dd = day.get(key) ?? { pv: 0, clk: 0 }
        if (e.type === 'click') dd.clk++; else dd.pv++
        day.set(key, dd)
        hours[d.getHours()]++
        weekday[d.getDay()]++
      }
      if (e.path) pages.set(e.path, (pages.get(e.path) ?? 0) + 1)
      if (e.type === 'click') {
        const lbl = [e.element?.tag, e.element?.id || e.element?.text].filter(Boolean).join(' · ') || '(unknown)'
        clicks.set(lbl, (clicks.get(lbl) ?? 0) + 1)
      }
      const ref = e.referrer ? e.referrer : '(direct)'
      referrers.set(ref, (referrers.get(ref) ?? 0) + 1)
      const ua = parseUA(e.userAgent)
      devices.set(ua.device, (devices.get(ua.device) ?? 0) + 1)
      browsers.set(ua.browser, (browsers.get(ua.browser) ?? 0) + 1)
      os.set(ua.os, (os.get(ua.os) ?? 0) + 1)
    }

    const sArr = [...sessions.values()]
    const sPages = sArr.reduce((n, s) => n + s.pages, 0)
    const sClicks = sArr.reduce((n, s) => n + s.clicks, 0)
    const sEvents = sArr.reduce((n, s) => n + s.count, 0)
    const single = sArr.filter((s) => s.pages <= 1).length
    const durations = sArr.filter((s) => Number.isFinite(s.first) && s.last > s.first).map((s) => s.last - s.first)
    const avgDur = durations.length ? durations.reduce((x, y) => x + y, 0) / durations.length : 0
    const depth = { one: sArr.filter((s) => s.pages <= 1).length, few: sArr.filter((s) => s.pages >= 2 && s.pages <= 3).length, many: sArr.filter((s) => s.pages >= 4).length }
    const depthTotal = sArr.length

    const dayKeys = [...day.keys()].sort()
    const timeline = dayKeys.map((k) => ({ day: k, pv: day.get(k)!.pv, clk: day.get(k)!.clk, total: day.get(k)!.pv + day.get(k)!.clk }))

    return {
      total: events.length, pv, clk,
      sessionCount: sessions.size,
      visitors: visitors.size,
      pagesPerSession: sessions.size ? sPages / sessions.size : 0,
      clicksPerSession: sessions.size ? sClicks / sessions.size : 0,
      eventsPerSession: sessions.size ? sEvents / sessions.size : 0,
      clickRate: pv ? clk / pv : 0,
      bounceRate: sessions.size ? single / sessions.size : 0,
      avgDurSec: Math.round(avgDur / 1000),
      depth, depthTotal,
      timeline,
      hours, weekday,
      topPages: topN(pages, 8),
      topClicks: topN(clicks, 8),
      topReferrers: topN(referrers, 6),
      devices: topN(devices, 5),
      browsers: topN(browsers, 5),
      os: topN(os, 5),
    }
  }, [report])

  // --- export ---
  const download = (content: string, mime: string, ext: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `pavillon46-activity-${new Date().toISOString().slice(0, 10)}.${ext}`
    link.click()
    URL.revokeObjectURL(url)
  }
  const exportJson = () => report && download(JSON.stringify(report, null, 2), 'application/json', 'json')
  const exportCsv = () => {
    if (!report) return
    const header = ['id', 'type', 'ts', 'path', 'sessionId', 'referrer', 'device', 'browser', 'elementTag', 'elementId', 'elementText']
    const rows = report.events.map((e) => {
      const ua = parseUA(e.userAgent)
      return [e.id, e.type, e.ts, e.path, e.sessionId, e.referrer, ua.device, ua.browser, e.element.tag, e.element.id, e.element.text]
    })
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    download(csv, 'text/csv', 'csv')
  }

  const pct = (n: number) => `${Math.round(n * 100)}%`
  const fmtDur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`)

  return (
    <>
      <div className="adash-head">
        <div>
          <h2>Activity &amp; engagement</h2>
          <p>How visitors move through pavillon46.ch — privacy-safe, first-party analytics{report ? ` · source: ${report.storage}` : ''}.</p>
        </div>
        <div className="adash-head-actions">
          <button className="adash-btn adash-btn-ghost adash-btn-sm" onClick={() => setHowOpen((s) => !s)} aria-expanded={howOpen}>
            {howOpen ? 'Hide' : 'How is this collected?'}
          </button>
          <button className="adash-btn adash-btn-ghost adash-btn-sm" onClick={exportCsv} disabled={!report}>Export CSV</button>
          <button className="adash-btn adash-btn-ghost adash-btn-sm" onClick={exportJson} disabled={!report}>Export JSON</button>
        </div>
      </div>

      {/* How data is collected — explainer */}
      {howOpen && (
        <div className="adash-how">
          <div className="adash-how-grid">
            <div className="adash-how-item">
              <span className="adash-how-num">1</span>
              <div><h4>A tiny tracker runs in the browser</h4><p>On every page and click, the site sends one small event to our own API. No third-party analytics, no advertising pixels.</p></div>
            </div>
            <div className="adash-how-item">
              <span className="adash-how-num">2</span>
              <div><h4>Two kinds of events</h4><p><strong>Page views</strong> on each navigation, and <strong>clicks</strong> on links &amp; buttons (with their label). The admin console itself is never tracked.</p></div>
            </div>
            <div className="adash-how-item">
              <span className="adash-how-num">3</span>
              <div><h4>Anonymous by design</h4><p>A random session id groups one visit; the visitor count uses a one-way <em>hash</em> of the IP — the raw IP is never stored. Emails &amp; phone numbers in click text are redacted.</p></div>
            </div>
            <div className="adash-how-item">
              <span className="adash-how-num">4</span>
              <div><h4>What we keep</h4><p>Path, timestamp, session, referring site (host only), and a trimmed user-agent (device &amp; browser). Everything below is derived from these fields.</p></div>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="adash-panel">
        <div className="adash-activity-controls">
          <div className="adash-seg" role="radiogroup" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                role="radio"
                aria-checked={range === r.key}
                tabIndex={range === r.key ? 0 : -1}
                className={range === r.key ? 'is-active' : ''}
                onClick={() => pickRange(r.key)}
                onKeyDown={(e) => {
                  const i = RANGES.findIndex((x) => x.key === range)
                  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); pickRange(RANGES[(i + 1) % RANGES.length].key) }
                  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); pickRange(RANGES[(i - 1 + RANGES.length) % RANGES.length].key) }
                }}
              >{r.label}</button>
            ))}
          </div>
          <div className="adash-activity-filters">
            <select className="adash-select" value={type} onChange={(e) => { const v = e.target.value as typeof type; setType(v); void runReport({ type: v }) }}>
              <option value="all">All events</option><option value="page_view">Page views</option><option value="click">Clicks</option>
            </select>
            <div className="adash-search">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" /><path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
              <input className="adash-input" aria-label="Filter by path" placeholder="Filter by path (e.g. /waitlist)" value={path}
                onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void runReport() }} />
            </div>
            <button className="adash-btn adash-btn-primary adash-btn-sm" onClick={() => void runReport()} disabled={loading}>{loading ? 'Loading…' : 'Apply'}</button>
          </div>
        </div>
        {report?.meta?.truncated && (
          <p className="adash-metric-note">Showing the most recent {report.meta.maxScan?.toLocaleString()} events — older data is omitted from these breakdowns.</p>
        )}
      </div>

      {error && <p className="adash-error">{error}</p>}

      {!report && loading && <p className="adash-loading">Loading analytics…</p>}

      {report && (
        <>
          {/* KPIs */}
          <div className="adash-kpi-grid">
            <div className="adash-kpi adash-kpi-compact"><span className="adash-kpi-label">Total events</span><strong className="adash-kpi-value">{a.total.toLocaleString()}</strong></div>
            <div className="adash-kpi adash-kpi-compact"><span className="adash-kpi-label">Page views</span><strong className="adash-kpi-value">{a.pv.toLocaleString()}</strong></div>
            <div className="adash-kpi adash-kpi-compact"><span className="adash-kpi-label">Clicks</span><strong className="adash-kpi-value">{a.clk.toLocaleString()}</strong></div>
            <div className="adash-kpi adash-kpi-compact"><span className="adash-kpi-label">Sessions</span><strong className="adash-kpi-value">{a.sessionCount.toLocaleString()}</strong></div>
            <div className="adash-kpi adash-kpi-compact"><span className="adash-kpi-label">Unique visitors</span><strong className="adash-kpi-value">{a.visitors.toLocaleString()}</strong></div>
            <div className="adash-kpi adash-kpi-compact"><span className="adash-kpi-label">Pages / session</span><strong className="adash-kpi-value">{a.pagesPerSession.toFixed(1)}</strong></div>
            <div className="adash-kpi adash-kpi-compact"><span className="adash-kpi-label">Clicks / view</span><strong className="adash-kpi-value">{a.clickRate.toFixed(2)}</strong></div>
            <div className="adash-kpi adash-kpi-compact"><span className="adash-kpi-label">Single-page visits</span><strong className="adash-kpi-value">{pct(a.bounceRate)}</strong></div>
          </div>

          {/* Timeline */}
          <div className="adash-panel">
            <div className="adash-panel-head">
              <h3>Activity over time</h3>
              <span className="adash-legend"><span className="adash-legend-dot is-green" />Page views<span className="adash-legend-dot is-coral" />Clicks</span>
            </div>
            <Timeline data={a.timeline} />
          </div>

          {/* Busiest hours */}
          <div className="adash-panel">
            <div className="adash-panel-head"><h3>Busiest hours <span className="adash-h3-sub">(your local time)</span></h3></div>
            <HourBars hours={a.hours} />
          </div>

          <div className="adash-two">
            <RankPanel title="Top pages" items={a.topPages} empty="No page views yet." mono />
            <RankPanel title="Most clicked" items={a.topClicks} empty="No clicks yet." />
          </div>

          <div className="adash-two">
            <RankPanel title="Devices" items={a.devices} empty="No data." />
            <RankPanel title="Browsers" items={a.browsers} empty="No data." />
          </div>

          <div className="adash-two">
            <RankPanel title="Top referrers" items={a.topReferrers} empty="No referrers." />
            <div className="adash-panel">
              <div className="adash-panel-head"><h3>Engagement</h3></div>
              <div className="adash-engage">
                <div className="adash-engage-row"><span>Avg. events / session</span><strong>{a.eventsPerSession.toFixed(1)}</strong></div>
                <div className="adash-engage-row"><span>Avg. clicks / session</span><strong>{a.clicksPerSession.toFixed(1)}</strong></div>
                <div className="adash-engage-row"><span>Avg. visit length</span><strong>{fmtDur(a.avgDurSec)}</strong></div>
                <div className="adash-engage-depth">
                  <span className="adash-engage-depth-label">Pages per visit</span>
                  <div className="adash-depth-bar">
                    {a.depthTotal > 0 && (
                      <>
                        <span className="adash-depth-seg is-one" style={{ flex: a.depth.one || 0.001 }} title={`1 page · ${a.depth.one}`} />
                        <span className="adash-depth-seg is-few" style={{ flex: a.depth.few || 0.001 }} title={`2–3 pages · ${a.depth.few}`} />
                        <span className="adash-depth-seg is-many" style={{ flex: a.depth.many || 0.001 }} title={`4+ pages · ${a.depth.many}`} />
                      </>
                    )}
                  </div>
                  <div className="adash-depth-key"><span><i className="is-one" />1 page · {a.depth.one}</span><span><i className="is-few" />2–3 · {a.depth.few}</span><span><i className="is-many" />4+ · {a.depth.many}</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent events */}
          <div className="adash-panel adash-panel-flush">
            <div className="adash-panel-head" style={{ padding: '16px 18px 0' }}><h3>Recent events</h3></div>
            <div className="adash-table-wrap">
              <table className="adash-table">
                <thead><tr><th>When</th><th>Type</th><th>Path</th><th>Session</th><th>Referrer</th><th>Device</th><th>Element</th></tr></thead>
                <tbody>
                  {report.events.slice(0, 60).map((e) => {
                    const ua = parseUA(e.userAgent)
                    return (
                      <tr key={e.id}>
                        <td className="adash-person-sub">{new Date(e.ts).toLocaleString()}</td>
                        <td><span className={`adash-pill ${e.type === 'click' ? 'is-pending' : 'is-accepted'}`}>{e.type === 'click' ? 'click' : 'view'}</span></td>
                        <td>{e.path}</td>
                        <td className="adash-mono">{e.sessionId.slice(0, 8)}</td>
                        <td className="adash-person-sub">{e.referrer || '(direct)'}</td>
                        <td className="adash-person-sub">{ua.device}</td>
                        <td className="adash-person-sub">{[e.element.tag, e.element.id, e.element.text].filter(Boolean).join(' · ') || '—'}</td>
                      </tr>
                    )
                  })}
                  {report.events.length === 0 && <tr><td colSpan={7} className="adash-empty">No events for this range.</td></tr>}
                </tbody>
              </table>
            </div>
            {report.events.length > 60 && (
              <p className="adash-metric-note" style={{ padding: '0 18px 14px' }}>Showing the 60 most recent of {a.total.toLocaleString()} events — export for the full set.</p>
            )}
          </div>
        </>
      )}
    </>
  )
}

// ---- Ranked bar panel (reuses .adash-bar-* styles) ----
function RankPanel({ title, items, empty, mono }: { title: string; items: { label: string; count: number }[]; empty: string; mono?: boolean }) {
  const max = Math.max(1, ...items.map((i) => i.count))
  return (
    <div className="adash-panel">
      <div className="adash-panel-head"><h3>{title}</h3></div>
      <div className="adash-bar-list">
        {items.length === 0 && <p className="adash-empty">{empty}</p>}
        {items.map((i) => (
          <div key={i.label}>
            <div className="adash-bar-row"><span className={`adash-bar-label${mono ? ' adash-mono' : ''}`}>{i.label}</span><span className="adash-bar-val">{i.count.toLocaleString()}</span></div>
            <div className="adash-bar-track"><div className="adash-bar-fill" style={{ width: `${(i.count / max) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- Busiest hours: 24 bars ----
function HourBars({ hours }: { hours: number[] }) {
  const max = Math.max(1, ...hours)
  return (
    <div className="adash-hours">
      {hours.map((v, h) => (
        <div key={h} className="adash-hour" title={`${h}:00 — ${v} events`}>
          <div className="adash-hour-track"><div className="adash-hour-fill" style={{ height: `${(v / max) * 100}%` }} /></div>
          {h % 6 === 0 && <span className="adash-hour-label">{h}h</span>}
        </div>
      ))}
    </div>
  )
}

// ---- Timeline area chart (SVG) ----
function Timeline({ data }: { data: { day: string; pv: number; clk: number; total: number }[] }) {
  if (data.length === 0) return <p className="adash-empty">No activity in this range.</p>
  const W = 720, H = 180, P = 8
  const max = Math.max(1, ...data.map((d) => d.total))
  const n = data.length
  const x = (i: number) => (n === 1 ? W / 2 : P + (i / (n - 1)) * (W - 2 * P))
  const y = (v: number) => H - 14 - (v / max) * (H - 28)
  const line = (sel: (d: typeof data[number]) => number) =>
    n === 1
      ? `M${P},${y(sel(data[0])).toFixed(1)} L${(W - P).toFixed(1)},${y(sel(data[0])).toFixed(1)}`
      : data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(sel(d)).toFixed(1)}`).join(' ')
  const areaTotal =
    n === 1
      ? `M${P},${y(data[0].total).toFixed(1)} L${(W - P).toFixed(1)},${y(data[0].total).toFixed(1)} L${(W - P).toFixed(1)},${H - 14} L${P},${H - 14} Z`
      : `${line((d) => d.total)} L${x(n - 1).toFixed(1)},${H - 14} L${x(0).toFixed(1)},${H - 14} Z`
  const fmtDay = (s: string) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
  const ticks = [...new Set(n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1])]
  return (
    <div className="adash-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Activity over time">
        <defs>
          <linearGradient id="actfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(63,129,99,0.42)" />
            <stop offset="100%" stopColor="rgba(63,129,99,0)" />
          </linearGradient>
        </defs>
        <path d={areaTotal} fill="url(#actfill)" />
        <path d={line((d) => d.total)} fill="none" stroke="#5fae86" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={line((d) => d.clk)} fill="none" stroke="#ff6e50" strokeWidth="1.6" strokeDasharray="3 3" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => <circle key={d.day} cx={x(i)} cy={y(d.total)} r={n > 40 ? 0 : 2.4} fill="#5fae86" />)}
      </svg>
      <div className="adash-chart-x">{ticks.map((i) => <span key={i}>{fmtDay(data[i].day)}</span>)}</div>
    </div>
  )
}
