import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'

const STORAGE_KEY = 'p46_report_key'
const EXPORT_LIMIT = 10000

function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value) || 0)
}

function formatFooterDate(value) {
  if (!value) return 'Not refreshed yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not refreshed yet'
  return date.toLocaleString()
}

function toIsoDate(value, inclusiveEnd = false) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  if (inclusiveEnd) {
    date.setSeconds(59, 999)
  } else {
    date.setSeconds(0, 0)
  }

  return date.toISOString()
}

function toLocalDateTimeInput(date) {
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function buildQuery(filters, limitOverride) {
  const query = new URLSearchParams()
  if (filters.type) query.set('type', filters.type)
  if (filters.path) query.set('path', filters.path)
  if (filters.from) {
    const fromIso = toIsoDate(filters.from, false)
    if (fromIso) query.set('from', fromIso)
  }
  if (filters.to) {
    const toIso = toIsoDate(filters.to, true)
    if (toIso) query.set('to', toIso)
  }
  query.set('limit', String(limitOverride ?? filters.limit))
  return query
}

function barSeries(events) {
  if (!events.length) return []
  const timestamps = events.map((event) => new Date(event.ts).getTime()).filter((value) => !Number.isNaN(value))
  if (!timestamps.length) return []

  const minTs = Math.min(...timestamps)
  const maxTs = Math.max(...timestamps)
  const useDailyBuckets = maxTs - minTs > 1000 * 60 * 60 * 48

  const buckets = new Map()
  for (const event of events) {
    const date = new Date(event.ts)
    if (Number.isNaN(date.getTime())) continue
    const bucketDate = new Date(date)
    bucketDate.setMinutes(0, 0, 0)
    if (useDailyBuckets) {
      bucketDate.setHours(0)
    }

    const key = bucketDate.toISOString()
    buckets.set(key, (buckets.get(key) || 0) + 1)
  }

  return Array.from(buckets.entries())
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .slice(-18)
    .map(([iso, count]) => ({
      label: useDailyBuckets
        ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' }),
      count,
    }))
}

function csvSafe(value) {
  const asText = String(value ?? '')
  const startsWithFormula = /^[=+\-@]/.test(asText)
  return JSON.stringify(startsWithFormula ? `'${asText}` : asText)
}

function downloadCsv(events, fileName) {
  const rows = [
    [
      'local_time',
      'utc_time',
      'type',
      'path',
      'sessionId',
      'elementTag',
      'elementId',
      'elementText',
      'referrer',
      'ipHash',
      'userAgent',
    ].join(','),
    ...events.map((event) =>
      [
        csvSafe(formatDateTime(event.ts)),
        csvSafe(event.ts || ''),
        csvSafe(event.type || ''),
        csvSafe(event.path || ''),
        csvSafe(event.sessionId || ''),
        csvSafe(event.element?.tag || ''),
        csvSafe(event.element?.id || ''),
        csvSafe(event.element?.text || ''),
        csvSafe(event.referrer || ''),
        csvSafe(event.ipHash || ''),
        csvSafe(event.userAgent || ''),
      ].join(',')
    ),
  ]

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export default function ActivityDashboard() {
  const [reportKey, setReportKey] = useState('')
  const [inputKey, setInputKey] = useState('')
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null)
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
      const query = buildQuery(filters)

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
      setLastRefreshedAt(new Date().toISOString())
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
  const referrers = useMemo(() => {
    const counts = new Map()
    for (const event of report?.events || []) {
      if (!event.referrer) continue
      counts.set(event.referrer, (counts.get(event.referrer) || 0) + 1)
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([referrer, count]) => ({ referrer, count }))
  }, [report?.events])

  const rangeLabel = useMemo(() => {
    const newest = report?.meta?.latestEventTs
    const oldest = report?.meta?.oldestEventTs
    if (!newest || !oldest) return '-'
    return `${formatDateTime(oldest)} - ${formatDateTime(newest)}`
  }, [report?.meta?.latestEventTs, report?.meta?.oldestEventTs])
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.type && filters.type !== 'all') count += 1
    if (filters.path.trim()) count += 1
    if (filters.from) count += 1
    if (filters.to) count += 1
    return count
  }, [filters])
  const rowsShown = report?.events?.length || 0
  const scannedEvents = report?.meta?.scannedEvents || 0

  const exportCsv = async () => {
    if (!reportKey) return
    setExporting(true)
    setError('')
    try {
      const query = buildQuery(filters, EXPORT_LIMIT)
      const response = await fetch(`/api/activity/report?${query.toString()}`, {
        headers: {
          'x-report-key': reportKey,
        },
      })

      if (!response.ok) {
        throw new Error('Unable to export report right now.')
      }

      const data = await response.json()
      if (!data?.events?.length) {
        throw new Error('No rows match the current filters.')
      }

      const fileName = `activity-report-${Date.now()}.csv`
      downloadCsv(data.events, fileName)
    } catch (exportError) {
      setError(exportError.message || 'Unexpected error while exporting CSV.')
    } finally {
      setExporting(false)
    }
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
          <div className="activity-header-copy">
            <h1>Pavillon 46 Activity Dashboard</h1>
            <p className="activity-subtle-text">
              Live visitor events from your internal logging API. Storage: <strong>{report?.storage || 'unknown'}</strong>
            </p>
            <p className="activity-subtle-text">
              Showing <strong>{formatNumber(rowsShown)}</strong> rows from <strong>{formatNumber(scannedEvents)}</strong> scanned events.
            </p>
          </div>
          <div className="activity-header-actions">
            <button type="button" className="activity-secondary-btn" onClick={exportCsv} disabled={exporting}>
              {exporting ? 'Exporting...' : `Export CSV (${EXPORT_LIMIT} max)`}
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
          <div className="activity-filter-heading">
            <h2>Filters</h2>
            <p className="activity-subtle-text">
              Auto-updates on change. Active filters: <strong>{activeFilterCount}</strong>
            </p>
          </div>
          <div className="activity-filter-grid">
            <label className="activity-filter-field">
              <span>Event type</span>
              <select value={filters.type} onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value }))}>
                <option value="all">All events</option>
                <option value="page_view">Page views</option>
                <option value="click">Clicks</option>
              </select>
            </label>
            <label className="activity-filter-field">
              <span>Path contains</span>
              <input
                type="text"
                placeholder="/waitlist, /admin, ..."
                value={filters.path}
                onChange={(event) => setFilters((prev) => ({ ...prev, path: event.target.value }))}
              />
            </label>
            <label className="activity-filter-field">
              <span>From</span>
              <input
                type="datetime-local"
                value={filters.from}
                onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
              />
            </label>
            <label className="activity-filter-field">
              <span>To</span>
              <input
                type="datetime-local"
                value={filters.to}
                onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
              />
            </label>
            <label className="activity-filter-field">
              <span>Rows on screen</span>
              <select
                value={String(filters.limit)}
                onChange={(event) => setFilters((prev) => ({ ...prev, limit: Number(event.target.value) }))}
              >
                <option value="300">300 rows</option>
                <option value="600">600 rows</option>
                <option value="1000">1000 rows</option>
                <option value="2500">2500 rows</option>
                <option value="5000">5000 rows</option>
              </select>
            </label>
            <div className="activity-filter-actions">
              <button type="button" className="activity-primary-btn" onClick={() => fetchReport()}>
                Refresh now
              </button>
              <button
                type="button"
                className="activity-secondary-btn"
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    type: 'all',
                    path: '',
                    from: '',
                    to: '',
                  }))
                }
              >
                Reset filters
              </button>
            </div>
          </div>
        </section>

        <section className="activity-quick-range">
          <button
            type="button"
            className="activity-secondary-btn"
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                from: toLocalDateTimeInput(new Date(Date.now() - 24 * 60 * 60 * 1000)),
                to: toLocalDateTimeInput(new Date()),
              }))
            }
          >
            Last 24 hours
          </button>
          <button
            type="button"
            className="activity-secondary-btn"
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                from: toLocalDateTimeInput(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
                to: toLocalDateTimeInput(new Date()),
              }))
            }
          >
            Last 7 days
          </button>
          <button
            type="button"
            className="activity-secondary-btn"
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                from: '',
                to: '',
              }))
            }
          >
            Clear date range
          </button>
        </section>

        {error && <p className="activity-error">{error}</p>}
        {loading && <p className="activity-loading">Loading report...</p>}

        <section className="activity-stats-grid">
          <article className="activity-stat-card">
            <span>Total events</span>
            <strong>{formatNumber(report?.summary?.totalEvents ?? 0)}</strong>
          </article>
          <article className="activity-stat-card">
            <span>Unique sessions</span>
            <strong>{formatNumber(report?.summary?.uniqueSessions ?? 0)}</strong>
          </article>
          <article className="activity-stat-card">
            <span>Page views</span>
            <strong>{formatNumber(report?.summary?.pageViews ?? 0)}</strong>
          </article>
          <article className="activity-stat-card">
            <span>Clicks</span>
            <strong>{formatNumber(report?.summary?.clicks ?? 0)}</strong>
          </article>
          <article className="activity-stat-card">
            <span>Scan status</span>
            <strong>{report?.meta?.truncated ? 'Partial' : 'Complete'}</strong>
          </article>
          <article className="activity-stat-card">
            <span>Date range</span>
            <strong className="activity-smaller-stat">{rangeLabel}</strong>
          </article>
        </section>

        <section className="activity-usage-note">
          <p>
            Tip: use <strong>Last 7 days</strong> to see trend direction, then narrow with path and type filters for diagnostics.
            Export includes more columns than on-screen table for deeper analysis in Excel.
          </p>
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

          <article className="activity-panel">
            <h2>Top referring domains</h2>
            <ul className="activity-top-list">
              {referrers.map((item) => (
                <li key={item.referrer}>
                  <span>{item.referrer}</span>
                  <strong>{item.count}</strong>
                </li>
              ))}
              {!referrers.length && <li className="activity-empty">No referrer data yet.</li>}
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

        <footer className="activity-dashboard-footer">
          <p>
            Last refreshed: <strong>{formatFooterDate(lastRefreshedAt)}</strong>
          </p>
          <p>
            Range: <strong>{rangeLabel}</strong>
          </p>
          <p>
            Need full analysis? Use <strong>Export CSV</strong> to open deeper details in Excel.
          </p>
        </footer>
      </main>
    </>
  )
}
