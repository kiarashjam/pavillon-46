import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  adminListApplicants,
  adminListMembers,
  adminUpdateApplicant,
  adminCreateApplicant,
  adminDeleteApplicant,
  type ApplicantDto,
  type AdminApplicantsResponse,
  type CreateApplicantBody,
  type MemberDto,
} from '../../lib/api'
import type { AdminCtx } from '../../components/admin/AdminLayout'
import AdminModal from '../../components/admin/AdminModal'
import { AdminEmpty, AdminSkeletonRows } from '../../components/admin/adminUi'

const STATUSES: ApplicantDto['status'][] = ['pending', 'reviewing', 'accepted', 'declined']

const emptyForm: CreateApplicantBody = {
  firstName: '', lastName: '', email: '', phone: '', city: '', message: '',
  referralCode: '', status: 'pending', language: 'fr',
}

export default function AdminReferralsSection({ embedded = false }: { embedded?: boolean }) {
  const { token } = useOutletContext<AdminCtx>()
  const [data, setData] = useState<AdminApplicantsResponse | null>(null)
  const [members, setMembers] = useState<MemberDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | ApplicantDto['status']>('all')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<ApplicantDto | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<CreateApplicantBody>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editBusy, setEditBusy] = useState(false)
  const [editForm, setEditForm] = useState<CreateApplicantBody>(emptyForm)

  const load = () => {
    setLoading(true)
    return Promise.all([adminListApplicants(token), adminListMembers(token).catch(() => ({ members: [] as MemberDto[] }))])
      .then(([d, m]) => { setData(d); setMembers(m.members); return d })
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
      setSelected((s) => (s && d ? d.applicants.find((x) => x.id === s.id) ?? null : s))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setSavingId(null)
    }
  }

  const set = (k: keyof CreateApplicantBody) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await adminCreateApplicant(token, {
        ...form,
        email: form.email?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        referralCode: form.referralCode?.trim() || undefined,
      })
      setCreating(false); setForm(emptyForm); await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add submitter')
    } finally { setBusy(false) }
  }

  const openEdit = (a: ApplicantDto) => {
    setSelected(a)
    setEditForm({
      firstName: a.firstName, lastName: a.lastName, email: a.email, phone: a.phone,
      city: a.city, message: a.message, referralCode: a.referralCode, status: a.status,
    })
    setEditing(true)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    setEditBusy(true); setError(null)
    try {
      const updated = await adminUpdateApplicant(token, selected.id, {
        firstName: editForm.firstName, lastName: editForm.lastName,
        email: editForm.email, phone: editForm.phone, city: editForm.city,
        message: editForm.message, status: editForm.status,
        referralCode: editForm.referralCode?.trim() || undefined,
      })
      setSelected(updated); setEditing(false); await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally { setEditBusy(false) }
  }

  const handleDelete = async (a: ApplicantDto) => {
    if (!window.confirm(`Remove ${`${a.firstName} ${a.lastName}`.trim() || 'this submitter'}? This cannot be undone.`)) return
    setError(null)
    try {
      await adminDeleteApplicant(token, a.id)
      setSelected(null); setEditing(false); await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to delete') }
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
      {!embedded && (
        <div className="adash-head">
          <div>
            <p className="adash-kicker">The door</p>
            <h2>Submitters</h2>
            <p>People referred by members — or added here by hand.</p>
          </div>
        </div>
      )}

      <div className="adash-head-actions adash-people-toolbar">
        <div className="adash-search">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" /><path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
          <input className="adash-input" aria-label="Search submitters" placeholder="Search submitters…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="adash-select" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <button className="adash-btn adash-btn-primary" onClick={() => { setError(null); setForm(emptyForm); setCreating(true) }}>Add submitter</button>
      </div>

      {error && <p className="adash-error">{error}</p>}

      <div className="adash-kpi-grid">
        {kpis.map((k) => (
          <div key={k.label} className="adash-kpi adash-kpi-compact"><span className="adash-kpi-label">{k.label}</span><strong className="adash-kpi-value">{k.value}</strong></div>
        ))}
      </div>

      <div className="adash-panel adash-panel-flush">
        {loading ? (
          <AdminSkeletonRows rows={6} />
        ) : (
          <div className="adash-table-wrap">
            <table className="adash-table">
              <thead><tr><th>Submitter</th><th>Contact</th><th>Referred by</th><th>Code</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr
                    key={a.id}
                    className="adash-row-clickable"
                    style={{ opacity: savingId === a.id ? 0.5 : 1 }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Edit ${a.firstName} ${a.lastName}`}
                    onClick={() => openEdit(a)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEdit(a) } }}
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
                {rows.length === 0 && (
                  <tr><td colSpan={6}>
                    <AdminEmpty
                      title={(data?.total ?? 0) === 0 ? 'No submitters yet' : 'Nothing matches these filters'}
                      hint={(data?.total ?? 0) === 0 ? 'Add someone by hand, or wait for a member to share their code.' : 'Clear the search or switch the status filter.'}
                      action={(data?.total ?? 0) === 0 ? (
                        <button className="adash-btn adash-btn-primary adash-btn-sm" onClick={() => { setError(null); setForm(emptyForm); setCreating(true) }}>Add a submitter</button>
                      ) : undefined}
                    />
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <AdminModal titleId="adm-create-applicant" onClose={() => setCreating(false)}>
          <form onSubmit={handleCreate} style={{ display: 'contents' }}>
            <div className="adash-modal-head">
              <div><h2 id="adm-create-applicant">Add a submitter</h2><p>Record someone at the door. Optionally credit a member.</p></div>
              <button type="button" className="adash-modal-close" onClick={() => setCreating(false)} aria-label="Close">×</button>
            </div>
            <ApplicantFields form={form} set={set} members={members} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="adash-btn adash-btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
              <button type="submit" className="adash-btn adash-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Add submitter'}</button>
            </div>
          </form>
        </AdminModal>
      )}

      {selected && editing && (
        <AdminModal titleId="adm-edit-applicant" onClose={() => { setEditing(false); setSelected(null) }}>
          <form onSubmit={handleEdit} style={{ display: 'contents' }}>
            <div className="adash-modal-head">
              <div>
                <h2 id="adm-edit-applicant">Edit submitter</h2>
                <p>{selected.applicationCode} · {selected.bonusAwarded ? 'bonus already awarded' : 'bonus not yet awarded'}</p>
              </div>
              <button type="button" className="adash-modal-close" onClick={() => { setEditing(false); setSelected(null) }} aria-label="Close">×</button>
            </div>
            <ApplicantFields
              form={editForm}
              set={(k) => (e) => setEditForm((f) => ({ ...f, [k]: e.target.value }))}
              members={members}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="adash-btn adash-btn-danger" onClick={() => handleDelete(selected)}>Remove</button>
              <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
                <button type="button" className="adash-btn adash-btn-ghost" onClick={() => { setEditing(false); setSelected(null) }}>Cancel</button>
                <button type="submit" className="adash-btn adash-btn-primary" disabled={editBusy}>{editBusy ? 'Saving…' : 'Save changes'}</button>
              </div>
            </div>
          </form>
        </AdminModal>
      )}
    </>
  )
}

function ApplicantFields({
  form,
  set,
  members,
}: {
  form: CreateApplicantBody
  set: (k: keyof CreateApplicantBody) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void
  members: MemberDto[]
}) {
  return (
    <div className="adash-form-grid">
      <div className="adash-field"><label>First name *</label><input className="adash-input" value={form.firstName} onChange={set('firstName')} required /></div>
      <div className="adash-field"><label>Last name *</label><input className="adash-input" value={form.lastName} onChange={set('lastName')} required /></div>
      <div className="adash-field"><label>Email</label><input className="adash-input" type="email" value={form.email ?? ''} onChange={set('email')} /></div>
      <div className="adash-field"><label>Phone</label><input className="adash-input" value={form.phone ?? ''} onChange={set('phone')} /></div>
      <div className="adash-field"><label>City</label><input className="adash-input" value={form.city ?? ''} onChange={set('city')} /></div>
      <div className="adash-field">
        <label>Status</label>
        <select className="adash-select" value={form.status ?? 'pending'} onChange={set('status')}>
          {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>
      <div className="adash-field full">
        <label>Referred by</label>
        <select className="adash-select" value={form.referralCode ?? ''} onChange={set('referralCode')}>
          <option value="">— none / walk-in —</option>
          {members.map((m) => (
            <option key={m.id} value={m.referralCode}>
              {[m.firstName, m.lastName].filter(Boolean).join(' ') || m.email} · {m.referralCode}
            </option>
          ))}
        </select>
      </div>
      <div className="adash-field full"><label>Message</label><textarea className="adash-input adash-textarea" value={form.message ?? ''} onChange={set('message')} /></div>
    </div>
  )
}
