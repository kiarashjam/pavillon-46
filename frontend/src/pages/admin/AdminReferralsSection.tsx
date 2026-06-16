import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { adminListApplicants, adminUpdateApplicant, type ApplicantDto, type AdminApplicantsResponse } from '../../lib/api'
import type { AdminCtx } from '../../components/admin/AdminLayout'
import AdminModal from '../../components/admin/AdminModal'

const STATUSES: ApplicantDto['status'][] = ['pending', 'reviewing', 'accepted', 'declined']

export default function AdminReferralsSection() {
  const { token } = useOutletContext<AdminCtx>()
  const [data, setData] = useState<AdminApplicantsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | ApplicantDto['status']>('all')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<ApplicantDto | null>(null)

  const load = () => {
    setLoading(true)
    return adminListApplicants(token)
      .then((d) => { setData(d); return d })
      .catch((e) => { setError(e instanceof Error ? e.message : 'Failed to load'); return null })
      .finally(() => setLoading(false))
  }
  useEffect(() => { void load() }, [token])

  const rows = useMemo(() => {
    let list = data?.applicants ?? []
    if (filter !== 'all') list = list.filter((a) => a.status === filter)
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((a) => `${a.firstName} ${a.lastName} ${a.email} ${a.phone} ${a.referrerName} ${a.applicationCode}`.toLowerCase().includes(q))
    return list
  }, [data, filter, search])

  const handleStatus = async (a: ApplicantDto, status: ApplicantDto['status']) => {
    setSavingId(a.id); setError(null)
    try {
      await adminUpdateApplicant(token, a.id, status)
      const d = await load()
      // Re-sync an open detail modal with the server-confirmed record (e.g. bonusAwarded).
      setSelected((s) => (s && d ? d.applicants.find((x) => x.id === s.id) ?? null : s))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setSavingId(null)
    }
  }

  const fmt = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB') }
  const kpis = [
    { label: 'Total', value: data?.total ?? 0 },
    { label: 'Pending', value: data?.pending ?? 0 },
    { label: 'Accepted', value: data?.accepted ?? 0 },
    { label: 'Declined', value: data?.declined ?? 0 },
  ]

  return (
    <>
      <div className="adash-head">
        <div>
          <h2>Referrals</h2>
          <p>People referred by members. Accepting one credits the referrer a free month.</p>
        </div>
        <div className="adash-head-actions">
          <div className="adash-search">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" /><path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            <input className="adash-input" aria-label="Search applicants" placeholder="Search applicants…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="adash-select" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="adash-error">{error}</p>}

      <div className="adash-kpi-grid">
        {kpis.map((k) => (
          <div key={k.label} className="adash-kpi adash-kpi-compact"><span className="adash-kpi-label">{k.label}</span><strong className="adash-kpi-value">{k.value}</strong></div>
        ))}
      </div>

      <div className="adash-panel adash-panel-flush">
        {loading ? (
          <p className="adash-loading" style={{ padding: 18 }}>Loading referrals…</p>
        ) : (
          <div className="adash-table-wrap">
            <table className="adash-table">
              <thead><tr><th>Applicant</th><th>Contact</th><th>Referred by</th><th>Code</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr
                    key={a.id}
                    className="adash-row-clickable"
                    style={{ opacity: savingId === a.id ? 0.5 : 1 }}
                    role="button"
                    tabIndex={0}
                    aria-label={`View referral from ${a.firstName} ${a.lastName}`}
                    onClick={() => setSelected(a)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(a) } }}
                  >
                    <td><span className="adash-person-name">{`${a.firstName} ${a.lastName}`.trim()}</span></td>
                    <td className="adash-person-sub">{a.email || a.phone || '—'}</td>
                    <td>{a.referrerName || '—'}</td>
                    <td className="adash-mono">{a.applicationCode}</td>
                    <td className="adash-person-sub">{fmt(a.createdAt)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className={`adash-status-select is-${a.status}`}
                        value={a.status}
                        disabled={savingId === a.id}
                        onChange={(e) => handleStatus(a, e.target.value as ApplicantDto['status'])}
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="adash-empty">{(data?.total ?? 0) === 0 ? 'No referrals yet.' : 'No referrals match your filters.'}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <AdminModal titleId="adm-ref-detail" onClose={() => setSelected(null)}>
          <div className="adash-modal-head">
            <div>
              <h2 id="adm-ref-detail">Referral submission</h2>
              <p>{`${selected.firstName} ${selected.lastName}`.trim()} · submitted {new Date(selected.createdAt).toLocaleString()}</p>
            </div>
            <button type="button" className="adash-modal-close" onClick={() => setSelected(null)} aria-label="Close">×</button>
          </div>
          <div className="adash-dl">
            <div><div className="adash-dt">First name</div><div className="adash-dd">{selected.firstName || '—'}</div></div>
            <div><div className="adash-dt">Last name</div><div className="adash-dd">{selected.lastName || '—'}</div></div>
            <div><div className="adash-dt">Email</div><div className="adash-dd">{selected.email || '—'}</div></div>
            <div><div className="adash-dt">Phone</div><div className="adash-dd">{selected.phone || '—'}</div></div>
            <div><div className="adash-dt">City</div><div className="adash-dd">{selected.city || '—'}</div></div>
            <div><div className="adash-dt">Bonus</div><div className="adash-dd">{selected.bonusAwarded ? 'Awarded — referrer credited' : 'Not yet'}</div></div>
            <div className="full"><div className="adash-dt">Message</div><div className="adash-dd adash-dd-message">{selected.message || '—'}</div></div>
            <div><div className="adash-dt">Referred by</div><div className="adash-dd">{selected.referrerName || '—'}</div></div>
            <div><div className="adash-dt">Referrer email</div><div className="adash-dd">{selected.referrerEmail || '—'}</div></div>
            <div><div className="adash-dt">Member referral code</div><div className="adash-dd adash-mono">{selected.referralCode}</div></div>
            <div><div className="adash-dt">Application reference</div><div className="adash-dd adash-mono">{selected.applicationCode}</div></div>
          </div>
          <div className="adash-detail-foot">
            <span className="adash-dt" style={{ margin: 0 }}>Status</span>
            <select
              className={`adash-status-select is-${selected.status}`}
              value={selected.status}
              onChange={(e) => {
                const ns = e.target.value as ApplicantDto['status']
                setSelected((s) => (s ? { ...s, status: ns } : s))
                void handleStatus(selected, ns)
              }}
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <button type="button" className="adash-btn adash-btn-ghost adash-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setSelected(null)}>Close</button>
          </div>
        </AdminModal>
      )}
    </>
  )
}
