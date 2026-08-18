import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { adminListAdmins, adminListApplicants, adminListMembers } from '../../lib/api'
import type { AdminCtx } from '../../components/admin/AdminLayout'
import AdminAdminsSection from './AdminAdminsSection'
import AdminMembersSection from './AdminMembersSection'
import AdminReferralsSection from './AdminReferralsSection'

export type PeopleTab = 'admins' | 'members' | 'submitters'

const TABS: { id: PeopleTab; label: string; hint: string }[] = [
  { id: 'admins', label: 'Admins', hint: 'The desk — keys to the console' },
  { id: 'members', label: 'Members', hint: 'Contracted accounts of the house' },
  { id: 'submitters', label: 'Submitters', hint: 'People at the door, referred or added' },
]

function parseTab(raw: string | null): PeopleTab {
  if (raw === 'admins' || raw === 'members' || raw === 'submitters') return raw
  if (raw === 'referrals' || raw === 'applicants') return 'submitters'
  return 'members'
}

export default function AdminPeople({ initialTab }: { initialTab?: PeopleTab }) {
  const { token } = useOutletContext<AdminCtx>()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const tab = parseTab(params.get('tab') ?? initialTab ?? null)
  const [counts, setCounts] = useState({ admins: 0, members: 0, submitters: 0 })

  useEffect(() => {
    document.title = 'People · Admin · Pavillon 46'
  }, [])

  useEffect(() => {
    let alive = true
    Promise.allSettled([
      adminListAdmins(token),
      adminListMembers(token),
      adminListApplicants(token),
    ]).then(([a, m, s]) => {
      if (!alive) return
      setCounts({
        admins: a.status === 'fulfilled' ? a.value.total : 0,
        members: m.status === 'fulfilled' ? m.value.total : 0,
        submitters: s.status === 'fulfilled' ? s.value.total : 0,
      })
    })
    return () => { alive = false }
  }, [token, tab])

  const setTab = (next: PeopleTab) => {
    navigate(`/admin/people?tab=${next}`, { replace: true })
  }

  const current = TABS.find((t) => t.id === tab) ?? TABS[1]

  return (
    <>
      <div className="adash-head">
        <div>
          <p className="adash-kicker">The house</p>
          <h2>People</h2>
          <p>{current.hint}.</p>
        </div>
      </div>

      <div className="adash-people-tabs" role="tablist" aria-label="People">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`adash-people-tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span>{t.label}</span>
            <em>{counts[t.id]}</em>
          </button>
        ))}
      </div>

      {tab === 'admins' && <AdminAdminsSection embedded />}
      {tab === 'members' && <AdminMembersSection embedded />}
      {tab === 'submitters' && <AdminReferralsSection embedded />}
    </>
  )
}
