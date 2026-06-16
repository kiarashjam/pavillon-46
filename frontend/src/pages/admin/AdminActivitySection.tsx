import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { fetchActivityReport, type ActivityReportDto } from '../../lib/api'
import type { AdminCtx } from '../../components/admin/AdminLayout'

export default function AdminActivitySection() {
  const { token } = useOutletContext<AdminCtx>()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [type, setType] = useState<'all' | 'page_view' | 'click'>('all')
  const [path, setPath] = useState('')
  const [limit, setLimit] = useState(300)
  const [report, setReport] = useState<ActivityReportDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const data = await fetchActivityReport({
        token,
        from: from || undefined,
        to: to || undefined,
        type: type === 'all' ? undefined : type,
        path: path || undefined,
        limit,
      })
      setReport(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report')
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() /* eslint-disable-next-line */ }, [token])

  const download = (content: string, mime: string, ext: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activity-${new Date().toISOString().slice(0, 10)}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }
  const exportJson = () => report && download(JSON.stringify(report, null, 2), 'application/json', 'json')
  const exportCsv = () => {
    if (!report) return
    const header = ['id', 'type', 'ts', 'path', 'sessionId', 'referrer', 'elementTag', 'elementId', 'elementText']
    const rows = report.events.map((e) => [e.id, e.type, e.ts, e.path, e.sessionId, e.referrer, e.element.tag, e.element.id, e.element.text])
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    download(csv, 'text/csv', 'csv')
  }

  const s = report?.summary
  const maxPage = Math.max(1, ...(s?.topPages ?? []).map((p) => p.count))
  const maxClick = Math.max(1, ...(s?.topClicks ?? []).map((c) => c.count))

  return (
    <>
      <div className="adash-head">
        <div>
          <h2>Activity</h2>
          <p>First-party, privacy-safe analytics{report ? ` · source: ${report.storage}` : ''}.</p>
        </div>
        <div className="adash-head-actions">
          <button className="adash-btn adash-btn-ghost adash-btn-sm" onClick={exportCsv} disabled={!report}>Export CSV</button>
          <button className="adash-btn adash-btn-ghost adash-btn-sm" onClick={exportJson} disabled={!report}>Export JSON</button>
        </div>
      </div>

      <div className="adash-panel">
        <div className="adash-filter-grid">
          <div className="adash-field"><label>From</label><input className="adash-input" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="adash-field"><label>To</label><input className="adash-input" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="adash-field"><label>Type</label>
            <select className="adash-select" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="all">All</option><option value="page_view">Page views</option><option value="click">Clicks</option>
            </select>
          </div>
          <div className="adash-field"><label>Path</label><input className="adash-input" placeholder="/waitlist" value={path} onChange={(e) => setPath(e.target.value)} /></div>
          <div className="adash-field"><label>Limit</label><input className="adash-input" type="number" min={1} max={50000} value={limit} onChange={(e) => setLimit(Number(e.target.value))} /></div>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="adash-btn adash-btn-primary adash-btn-sm" onClick={() => void load()} disabled={loading}>{loading ? 'Loading…' : 'Apply filters'}</button>
        </div>
      </div>

      {error && <p className="adash-error">{error}</p>}

      {s && (
        <div className="adash-kpi-grid">
          <div className="adash-kpi adash-kpi-compact"><span className="adash-kpi-label">Total events</span><strong className="adash-kpi-value">{s.totalEvents}</strong></div>
          <div className="adash-kpi adash-kpi-compact"><span className="adash-kpi-label">Page views</span><strong className="adash-kpi-value">{s.pageViews}</strong></div>
          <div className="adash-kpi adash-kpi-compact"><span className="adash-kpi-label">Clicks</span><strong className="adash-kpi-value">{s.clicks}</strong></div>
          <div className="adash-kpi adash-kpi-compact"><span className="adash-kpi-label">Unique sessions</span><strong className="adash-kpi-value">{s.uniqueSessions}</strong></div>
        </div>
      )}

      {s && (
        <div className="adash-two">
          <div className="adash-panel">
            <div className="adash-panel-head"><h3>Top pages</h3></div>
            <div className="adash-bar-list">
              {s.topPages.length === 0 && <p className="adash-empty">No data.</p>}
              {s.topPages.map((p) => (
                <div key={p.path}>
                  <div className="adash-bar-row"><span className="adash-bar-label">{p.path}</span><span className="adash-bar-val">{p.count}</span></div>
                  <div className="adash-bar-track"><div className="adash-bar-fill" style={{ width: `${(p.count / maxPage) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
          <div className="adash-panel">
            <div className="adash-panel-head"><h3>Top clicks</h3></div>
            <div className="adash-bar-list">
              {s.topClicks.length === 0 && <p className="adash-empty">No data.</p>}
              {s.topClicks.map((c) => (
                <div key={c.label}>
                  <div className="adash-bar-row"><span className="adash-bar-label">{c.label}</span><span className="adash-bar-val">{c.count}</span></div>
                  <div className="adash-bar-track"><div className="adash-bar-fill" style={{ width: `${(c.count / maxClick) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="adash-panel adash-panel-flush">
        <div className="adash-table-wrap">
          <table className="adash-table">
            <thead><tr><th>When</th><th>Type</th><th>Path</th><th>Session</th><th>Referrer</th><th>Element</th></tr></thead>
            <tbody>
              {(report?.events ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="adash-person-sub">{new Date(e.ts).toLocaleString()}</td>
                  <td><span className={`adash-pill ${e.type === 'click' ? 'is-pending' : 'is-accepted'}`}>{e.type}</span></td>
                  <td>{e.path}</td>
                  <td className="adash-mono">{e.sessionId.slice(0, 8)}</td>
                  <td className="adash-person-sub">{e.referrer || '—'}</td>
                  <td className="adash-person-sub">{[e.element.tag, e.element.id, e.element.text].filter(Boolean).join(' · ') || '—'}</td>
                </tr>
              ))}
              {report && report.events.length === 0 && <tr><td colSpan={6} className="adash-empty">No events for these filters.</td></tr>}
              {!report && !loading && <tr><td colSpan={6} className="adash-empty">No data loaded.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
