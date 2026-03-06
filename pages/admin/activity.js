import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'

const STORAGE_KEY = 'p46_report_key'

function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function barSeries(events) {
  const buckets = new Map()
  for (const event of events) {
    const date = new Date(event.ts)
    if (Number.isNaN(date.getTime())) continue
    const bucket = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:00`
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1)
  }

  return Array.from(buckets.entries())
    .slice(-12)
    .map(([label, count]) => ({ label, count }))
}

export default function ActivityDashboard() {
  const [reportKey, setReportKey] = useState('')
  const [inputKey, setInputKey] = useState('')
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    type: 'all',
    path: '',
    from: '',
    to: '',
    limit: 300,
  })

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY) || ''
    if (stored) {
      setReportKey(stored)
      setInputKey(stored)
    }
  }, [])

  const fetchReport = async (key = reportKey) => {
    if (!key) return

    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (filters.type) query.set('type', filters.type)
      if (filters.path) query.set('path', filters.path)
      if (filters.from) query.set('from', new Date(filters.from).toISOString())
      if (filters.to) query.set('to', new Date(filters.to).toISOString())
      query.set('limit', String(filters.limit))

      const response = await fetch(`/api/activity/report?${query.toString()}`, {
        headers: {
          'x-report-key': key,
        },
      })

      if (response.status === 401) {
        setError('Unauthorized key. Please re-enter your report key.')
        return
      }

      if (!response.ok) {
        throw new Error('Unable to fetch activity report.')
      }

      const data = await response.json()
      setReport(data)
      sessionStorage.setItem(STORAGE_KEY, key)
      setReportKey(key)
    } catch (fetchError) {
      setError(fetchError.message || 'Unexpected error while loading report.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!reportKey) return
    fetchReport(reportKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.type, filters.path, filters.from, filters.to, filters.limit, reportKey])

  const bars = useMemo(() => barSeries(report?.events || []), [report?.events])

  const exportCsv = () => {
    if (!report?.events?.length) return
    const rows = [
      ['time', 'type', 'path', 'sessionId', 'elementTag', 'elementId', 'elementText', 'userAgent'].join(','),
      ...report.events.map((event) =>
        [
          JSON.stringify(event.ts || ''),
          JSON.stringify(event.type || ''),
          JSON.stringify(event.path || ''),
          JSON.stringify(event.sessionId || ''),
          JSON.stringify(event.element?.tag || ''),
          JSON.stringify(event.element?.id || ''),
          JSON.stringify(event.element?.text || ''),
          JSON.stringify(event.userAgent || ''),
        ].join(',')
      ),
    ]

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `activity-report-${Date.now()}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!reportKey) {
    return (
      <>
        <Head>
          <title>Activity Report Access</title>
        </Head>
        <main className="activity-admin-page">
          <section className="activity-auth-card">
            <h1>Activity Report</h1>
            <p>Enter your report key to access visitor analytics.</p>
            <input
              type="password"
              value={inputKey}
              onChange={(event) => setInputKey(event.target.value)}
              placeholder="Report key"
              className="activity-auth-input"
            />
            <button
              type="button"
              className="activity-primary-btn"
              onClick={() => {
                if (!inputKey) return
                setReportKey(inputKey)
              }}
            >
              Open report
            </button>
          </section>
        </main>
      </>
    )
  }

  return (
    <>
      <Head>
        <title>Pavillon 46 Activity Dashboard</title>
      </Head>
      <main className="activity-admin-page">
        <section className="activity-header-panel">
          <div>
            <h1>Pavillon 46 Activity Dashboard</h1>
            <p>Live visitor events from your internal logging API.</p>
          </div>
          <div className="activity-header-actions">
            <button type="button" className="activity-secondary-btn" onClick={exportCsv}>
              Export CSV
            </button>
            <button
              type="button"
              className="activity-secondary-btn"
              onClick={() => {
                sessionStorage.removeItem(STORAGE_KEY)
                setReportKey('')
                setInputKey('')
                setReport(null)
              }}
            >
              Sign out
            </button>
          </div>
        </section>

        <section className="activity-filter-panel">
          <select value={filters.type} onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value }))}>
            <option value="all">All events</option>
            <option value="page_view">Page views</option>
            <option value="click">Clicks</option>
          </select>
          <input
            type="text"
            placeholder="Filter by path..."
            value={filters.path}
            onChange={(event) => setFilters((prev) => ({ ...prev, path: event.target.value }))}
          />
          <input
            type="datetime-local"
            value={filters.from}
            onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
          />
          <input
            type="datetime-local"
            value={filters.to}
            onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
          />
          <select
            value={String(filters.limit)}
            onChange={(event) => setFilters((prev) => ({ ...prev, limit: Number(event.target.value) }))}
          >
            <option value="100">100 rows</option>
            <option value="300">300 rows</option>
            <option value="600">600 rows</option>
            <option value="1000">1000 rows</option>
          </select>
          <button type="button" className="activity-primary-btn" onClick={() => fetchReport()}>
            Refresh
          </button>
        </section>

        {error && <p className="activity-error">{error}</p>}
        {loading && <p className="activity-loading">Loading report...</p>}

        <section className="activity-stats-grid">
          <article className="activity-stat-card">
            <span>Total events</span>
            <strong>{report?.summary?.totalEvents ?? 0}</strong>
          </article>
          <article className="activity-stat-card">
            <span>Unique sessions</span>
            <strong>{report?.summary?.uniqueSessions ?? 0}</strong>
          </article>
          <article className="activity-stat-card">
            <span>Page views</span>
            <strong>{report?.summary?.pageViews ?? 0}</strong>
          </article>
          <article className="activity-stat-card">
            <span>Clicks</span>
            <strong>{report?.summary?.clicks ?? 0}</strong>
          </article>
        </section>

        <section className="activity-insights-grid">
          <article className="activity-panel">
            <h2>Activity trend</h2>
            <div className="activity-bar-list">
              {bars.length === 0 && <p className="activity-empty">No data yet.</p>}
              {bars.map((bar) => (
                <div className="activity-bar-row" key={bar.label}>
                  <span>{bar.label}</span>
                  <div className="activity-bar-track">
                    <div
                      className="activity-bar-fill"
                      style={{ width: `${Math.max(6, (bar.count / Math.max(...bars.map((item) => item.count), 1)) * 100)}%` }}
                    />
                  </div>
                  <strong>{bar.count}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="activity-panel">
            <h2>Top pages</h2>
            <ul className="activity-top-list">
              {(report?.summary?.topPages || []).map((item) => (
                <li key={item.path}>
                  <span>{item.path}</span>
                  <strong>{item.count}</strong>
                </li>
              ))}
              {!report?.summary?.topPages?.length && <li className="activity-empty">No page data yet.</li>}
            </ul>
          </article>

          <article className="activity-panel">
            <h2>Top clicked elements</h2>
            <ul className="activity-top-list">
              {(report?.summary?.topClicks || []).map((item) => (
                <li key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </li>
              ))}
              {!report?.summary?.topClicks?.length && <li className="activity-empty">No click data yet.</li>}
            </ul>
          </article>
        </section>

        <section className="activity-events-panel">
          <h2>Recent events</h2>
          <div className="activity-events-table-wrap">
            <table className="activity-events-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Path</th>
                  <th>Element</th>
                  <th>Session</th>
                  <th>User agent</th>
                </tr>
              </thead>
              <tbody>
                {(report?.events || []).map((event) => (
                  <tr key={event.id}>
                    <td>{formatDateTime(event.ts)}</td>
                    <td>
                      <span className={`activity-type-pill ${event.type === 'click' ? 'is-click' : 'is-page'}`}>{event.type}</span>
                    </td>
                    <td>{event.path || '-'}</td>
                    <td>{[event.element?.tag, event.element?.id || event.element?.text].filter(Boolean).join(' - ') || '-'}</td>
                    <td>{event.sessionId ? `${event.sessionId.slice(0, 12)}...` : '-'}</td>
                    <td>{event.userAgent || '-'}</td>
                  </tr>
                ))}
                {!report?.events?.length && (
                  <tr>
                    <td colSpan={6} className="activity-empty">
                      No events match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  )
}
