import { useEffect, useMemo, useState } from 'react'
import { fetchActivityReport, type ActivityReportDto } from '../lib/api'

const KEY_STORAGE = 'pavillon46_activity_report_key'

export default function AdminActivity() {
  const [reportKey, setReportKey] = useState<string>(() => localStorage.getItem(KEY_STORAGE) ?? '')
  const [submittedKey, setSubmittedKey] = useState<string | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [type, setType] = useState<'all' | 'page_view' | 'click'>('all')
  const [path, setPath] = useState('')
  const [limit, setLimit] = useState(300)
  const [report, setReport] = useState<ActivityReportDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Activity Dashboard — Pavillon 46'
  }, [])

  const load = async (keyOverride?: string) => {
    const key = (keyOverride ?? submittedKey ?? '').trim()
    if (!key) {
      setError('Enter an admin key first.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchActivityReport({
        key,
        from: from || undefined,
        to: to || undefined,
        type: type === 'all' ? undefined : type,
        path: path || undefined,
        limit,
      })
      setReport(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = reportKey.trim()
    if (!trimmed) return
    localStorage.setItem(KEY_STORAGE, trimmed)
    setSubmittedKey(trimmed)
    void load(trimmed)
  }

  const handleExportJson = () => {
    if (!report) return
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activity-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportCsv = () => {
    if (!report) return
    const header = ['id', 'type', 'ts', 'path', 'sessionId', 'referrer', 'elementTag', 'elementId', 'elementText']
    const rows = report.events.map((e) => [
      e.id,
      e.type,
      e.ts,
      e.path,
      e.sessionId,
      e.referrer,
      e.element.tag,
      e.element.id,
      e.element.text,
    ])
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activity-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const summaryTable = useMemo(() => {
    if (!report) return null
    const s = report.summary
    return (
      <div className="activity-summary">
        <div><strong>Total events:</strong> {s.totalEvents}</div>
        <div><strong>Page views:</strong> {s.pageViews}</div>
        <div><strong>Clicks:</strong> {s.clicks}</div>
        <div><strong>Unique sessions:</strong> {s.uniqueSessions}</div>
      </div>
    )
  }, [report])

  if (!submittedKey) {
    return (
      <div className="admin-activity">
        <h1>Activity Dashboard</h1>
        <form onSubmit={handleAuth} className="admin-auth-form">
          <label htmlFor="report-key">Admin key</label>
          <input
            id="report-key"
            type="password"
            value={reportKey}
            onChange={(e) => setReportKey(e.target.value)}
            autoComplete="off"
            required
          />
          <button type="submit">View report</button>
        </form>
        {error && <p className="form-error">{error}</p>}
      </div>
    )
  }

  return (
    <div className="admin-activity">
      <h1>Activity Dashboard</h1>

      <div className="admin-controls">
        <label>From <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label>Type
          <select value={type} onChange={(e) => setType(e.target.value as 'all' | 'page_view' | 'click')}>
            <option value="all">All</option>
            <option value="page_view">Page views</option>
            <option value="click">Clicks</option>
          </select>
        </label>
        <label>Path <input type="text" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/waitlist" /></label>
        <label>Limit <input type="number" min={1} max={50000} value={limit} onChange={(e) => setLimit(Number(e.target.value))} /></label>
        <button onClick={() => load()} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        <button onClick={handleExportCsv} disabled={!report}>Export CSV</button>
        <button onClick={handleExportJson} disabled={!report}>Export JSON</button>
        <button
          onClick={() => {
            localStorage.removeItem(KEY_STORAGE)
            setSubmittedKey(null)
            setReportKey('')
            setReport(null)
          }}
        >Sign out</button>
      </div>

      {error && <p className="form-error">{error}</p>}
      {summaryTable}

      {report && (
        <>
          <div className="ranked-lists">
            <section>
              <h2>Top pages</h2>
              <ol>
                {report.summary.topPages.map((p) => (
                  <li key={p.path}>{p.path} — <strong>{p.count}</strong></li>
                ))}
              </ol>
            </section>
            <section>
              <h2>Top clicks</h2>
              <ol>
                {report.summary.topClicks.map((c) => (
                  <li key={c.label}>{c.label} — <strong>{c.count}</strong></li>
                ))}
              </ol>
            </section>
          </div>

          <table className="activity-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Path</th>
                <th>Session</th>
                <th>Referrer</th>
                <th>Element</th>
              </tr>
            </thead>
            <tbody>
              {report.events.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.ts).toLocaleString()}</td>
                  <td>{e.type}</td>
                  <td>{e.path}</td>
                  <td>{e.sessionId.slice(0, 8)}</td>
                  <td>{e.referrer}</td>
                  <td>{[e.element.tag, e.element.id, e.element.text].filter(Boolean).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
