import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { motion } from 'framer-motion'
import { animationVariants } from '../../lib/constants'
import {
  adminListMembers,
  adminListApplicants,
  fetchActivityReport,
  type MemberDto,
  type ApplicantDto,
  type AdminApplicantsResponse,
} from '../../lib/api'
import type { AdminCtx } from '../../components/admin/AdminLayout'

const kpiIcons = {
  members: <svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M16 7.5a3 3 0 0 1 0 5.6M16.5 14c2.5.4 4 2.3 4 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  refer: <svg viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-4.35-9.5-8.5C1 9.5 2.5 6.5 5.5 6.5c2 0 3.2 1.2 3.8 2.2.6-1 1.8-2.2 3.8-2.2 3 0 4.5 3 3 6C19 16.65 12 21 12 21Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.6" /><path d="M12 8v4.4l3 1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
}

export default function AdminOverview() {
  const { token } = useOutletContext<AdminCtx>()
  const navigate = useNavigate()
  const [members, setMembers] = useState<MemberDto[]>([])
  const [apps, setApps] = useState<AdminApplicantsResponse | null>(null)
  const [activity, setActivity] = useState<{ pageViews: number; clicks: number; sessions: number; storage: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.allSettled([
      adminListMembers(token),
      adminListApplicants(token),
      fetchActivityReport({ token, limit: 2000 }),
    ]).then(([m, a, act]) => {
      if (!active) return
      if (m.status === 'fulfilled') setMembers(m.value.members)
      if (a.status === 'fulfilled') setApps(a.value)
      if (act.status === 'fulfilled') {
        const s = act.value.summary
        setActivity({ pageViews: s.pageViews, clicks: s.clicks, sessions: s.uniqueSessions, storage: act.value.storage })
      }
      if (m.status === 'rejected') setError(m.reason instanceof Error ? m.reason.message : 'Failed to load')
    })
    return () => { active = false }
  }, [token])

  const recentMembers = [...members].slice(0, 6)
  const recentApps = (apps?.applicants ?? []).slice(0, 6)
  const initials = (m: MemberDto) => `${m.firstName?.[0] ?? ''}${m.lastName?.[0] ?? ''}`.toUpperCase() || m.email[0]?.toUpperCase()
  const statusLabel = (s: ApplicantDto['status']) => s.charAt(0).toUpperCase() + s.slice(1)
  const fmt = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB') }

  const kpis = [
    { label: 'Members', value: members.length, ico: kpiIcons.members, cls: '', sub: 'contracted accounts' },
    { label: 'Referrals', value: apps?.total ?? 0, ico: kpiIcons.refer, cls: 'is-lav', sub: 'total applicants' },
    { label: 'Pending', value: apps?.pending ?? 0, ico: kpiIcons.clock, cls: '', sub: 'awaiting review' },
    { label: 'Accepted', value: apps?.accepted ?? 0, ico: kpiIcons.check, cls: 'is-green', sub: 'signed / free months' },
  ]

  return (
    <>
      <div className="adash-head">
        <div>
          <h2>Overview</h2>
          <p>A live snapshot of members, referrals and engagement.</p>
        </div>
        <div className="adash-head-actions">
          <button className="adash-btn adash-btn-ghost" onClick={() => navigate('/admin/referrals')}>Referrals</button>
          <button className="adash-btn adash-btn-primary" onClick={() => navigate('/admin/members')}>Add member</button>
        </div>
      </div>

      {error && <p className="adash-error">{error}</p>}

      <motion.div className="adash-kpi-grid" variants={animationVariants.container} initial="hidden" animate="visible">
        {kpis.map((k) => (
          <motion.div key={k.label} className="adash-kpi" variants={animationVariants.item}>
            <div className="adash-kpi-top">
              <span className="adash-kpi-label">{k.label}</span>
              <span className={`adash-kpi-ico ${k.cls}`}>{k.ico}</span>
            </div>
            <strong className="adash-kpi-value">{k.value}</strong>
            <span className="adash-kpi-sub">{k.sub}</span>
          </motion.div>
        ))}
      </motion.div>

      <div className="adash-two">
        <div className="adash-panel">
          <div className="adash-panel-head">
            <h3>Recent referrals</h3>
            <button className="adash-link" onClick={() => navigate('/admin/referrals')}>View all →</button>
          </div>
          {recentApps.length === 0 ? (
            <p className="adash-empty">No referrals yet.</p>
          ) : (
            <div className="adash-table-wrap">
              <table className="adash-table">
                <thead><tr><th>Applicant</th><th>Referred by</th><th>Status</th></tr></thead>
                <tbody>
                  {recentApps.map((a) => (
                    <tr key={a.id}>
                      <td><span className="adash-strong">{`${a.firstName} ${a.lastName}`.trim()}</span><br /><span className="adash-person-sub">{a.email || a.phone || '—'}</span></td>
                      <td>{a.referrerName || '—'}</td>
                      <td><span className={`adash-pill is-${a.status}`}>{statusLabel(a.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="adash-panel">
          <div className="adash-panel-head">
            <h3>Recent members</h3>
            <button className="adash-link" onClick={() => navigate('/admin/members')}>View all →</button>
          </div>
          {recentMembers.length === 0 ? (
            <p className="adash-empty">No members yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recentMembers.map((m) => (
                <div key={m.id} className="adash-person" style={{ padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="adash-ava">{initials(m)}</span>
                  <span className="adash-person-info">
                    <span className="adash-person-name">{[m.title, m.firstName, m.lastName].filter(Boolean).join(' ')}</span>
                    <span className="adash-person-sub">{m.email} · {fmt(m.createdAt)}</span>
                  </span>
                  <span className="adash-mono" style={{ marginLeft: 'auto', fontSize: 12 }}>{m.referralCode}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="adash-panel">
        <div className="adash-panel-head">
          <h3>Activity snapshot</h3>
          <button className="adash-link" onClick={() => navigate('/admin/activity')}>Open analytics →</button>
        </div>
        {activity ? (
          <div className="adash-kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            <div className="adash-kpi adash-kpi-compact"><span className="adash-kpi-label">Page views</span><strong className="adash-kpi-value">{activity.pageViews}</strong><span className="adash-kpi-sub">recent events</span></div>
            <div className="adash-kpi adash-kpi-compact"><span className="adash-kpi-label">Clicks</span><strong className="adash-kpi-value">{activity.clicks}</strong><span className="adash-kpi-sub">tracked interactions</span></div>
            <div className="adash-kpi adash-kpi-compact"><span className="adash-kpi-label">Sessions</span><strong className="adash-kpi-value">{activity.sessions}</strong><span className="adash-kpi-sub">unique visitors</span></div>
          </div>
        ) : (
          <p className="adash-loading">Loading analytics…</p>
        )}
      </div>
    </>
  )
}
