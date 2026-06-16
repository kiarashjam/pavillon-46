import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  adminListMembers,
  adminCreateMember,
  adminResetPassword,
  adminSendCredentials,
  type MemberDto,
  type CreateMemberBody,
  type CreateMemberResponse,
} from '../../lib/api'
import type { AdminCtx } from '../../components/admin/AdminLayout'
import AdminModal from '../../components/admin/AdminModal'

const emptyForm: CreateMemberBody = {
  title: '', firstName: '', lastName: '', email: '', phone: '', city: '', country: '',
  contractRef: '', notes: '', language: 'fr', sendEmail: true,
}

export default function AdminMembersSection() {
  const { token } = useOutletContext<AdminCtx>()
  const [members, setMembers] = useState<MemberDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<CreateMemberBody>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<CreateMemberResponse | null>(null)
  const [sendState, setSendState] = useState<string | null>(null)
  const [selected, setSelected] = useState<MemberDto | null>(null)

  const load = () => {
    setLoading(true)
    adminListMembers(token)
      .then((d) => setMembers(d.members))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [token])

  const set = (k: keyof CreateMemberBody) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => `${m.title} ${m.firstName} ${m.lastName} ${m.email} ${m.referralCode}`.toLowerCase().includes(q))
  }, [members, search])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null); setSendState(null)
    try {
      const res = await adminCreateMember(token, form)
      setCreated(res); setForm(emptyForm); setModal(false); load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create member')
    } finally { setBusy(false) }
  }

  const handleReset = async (m: MemberDto) => {
    if (!window.confirm(`Generate a new password for ${m.email}? The current one stops working.`)) return
    setError(null); setSendState(null)
    try {
      const res = await adminResetPassword(token, m.id, false)
      setCreated(res); window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to reset password') }
  }

  const handleSend = async () => {
    if (!created) return
    setSendState('sending')
    try {
      await adminSendCredentials(token, { memberId: created.member.id, password: created.password })
      setSendState('sent')
    } catch (err) { setSendState(err instanceof Error ? err.message : 'Failed to send') }
  }

  const copy = (v: string) => void navigator.clipboard?.writeText(v)
  const initials = (m: MemberDto) => `${m.firstName?.[0] ?? ''}${m.lastName?.[0] ?? ''}`.toUpperCase() || m.email[0]?.toUpperCase()

  return (
    <>
      <div className="adash-head">
        <div>
          <h2>Members</h2>
          <p>{members.length} contracted member{members.length === 1 ? '' : 's'}.</p>
        </div>
        <div className="adash-head-actions">
          <div className="adash-search">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" /><path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            <input className="adash-input" aria-label="Search members" placeholder="Search members…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button className="adash-btn adash-btn-primary" onClick={() => { setForm(emptyForm); setModal(true) }}>+ Add member</button>
        </div>
      </div>

      {error && <p className="adash-error">{error}</p>}

      {created && (
        <div className="adash-creds">
          <h3>Credentials generated — copy now (shown once)</h3>
          <div className="adash-cred-row">
            <div><span>Email</span><strong>{created.member.email}</strong></div>
            <button className="adash-btn adash-btn-ghost adash-btn-sm" onClick={() => copy(created.member.email)}>Copy</button>
          </div>
          <div className="adash-cred-row">
            <div><span>Temporary password</span><strong className="adash-mono">{created.password}</strong></div>
            <button className="adash-btn adash-btn-ghost adash-btn-sm" onClick={() => copy(created.password)}>Copy</button>
          </div>
          <div className="adash-cred-actions">
            <button className="adash-btn adash-btn-primary adash-btn-sm" onClick={handleSend} disabled={sendState === 'sending'}>
              {sendState === 'sending' ? 'Sending…' : sendState === 'sent' ? 'Emailed ✓' : 'Email credentials'}
            </button>
            {created.emailSent && <span className="adash-hint">Already emailed on creation.</span>}
            {created.emailError && <span className="adash-hint warn">Email error: {created.emailError}</span>}
            {sendState && sendState !== 'sending' && sendState !== 'sent' && <span className="adash-hint warn">{sendState}</span>}
            <button className="adash-link" onClick={() => setCreated(null)} style={{ marginLeft: 'auto' }}>Dismiss</button>
          </div>
        </div>
      )}

      <div className="adash-panel adash-panel-flush">
        {loading ? (
          <p className="adash-loading" style={{ padding: 18 }}>Loading members…</p>
        ) : (
          <div className="adash-table-wrap">
            <table className="adash-table">
              <thead><tr><th>Member</th><th>Referral code</th><th>Referrals</th><th>Free months</th><th>Status</th><th /></tr></thead>
              <tbody>
                {filtered.map((m) => (
                  <tr
                    key={m.id}
                    className="adash-row-clickable"
                    role="button"
                    tabIndex={0}
                    aria-label={`View ${[m.firstName, m.lastName].filter(Boolean).join(' ')}`}
                    onClick={() => setSelected(m)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(m) } }}
                  >
                    <td>
                      <div className="adash-person">
                        <span className="adash-ava">{initials(m)}</span>
                        <span className="adash-person-info">
                          <span className="adash-person-name">{[m.title, m.firstName, m.lastName].filter(Boolean).join(' ')}</span>
                          <span className="adash-person-sub">{m.email}</span>
                        </span>
                      </div>
                    </td>
                    <td className="adash-mono">{m.referralCode}</td>
                    <td>{m.successfulReferrals}/{m.referralCount}</td>
                    <td className="adash-strong">{m.successfulReferrals}</td>
                    <td><span className={`adash-pill is-${m.status}`}>{m.status}</span></td>
                    <td onClick={(e) => e.stopPropagation()}><button className="adash-btn adash-btn-ghost adash-btn-sm" onClick={() => handleReset(m)}>Reset pw</button></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="adash-empty">
                    {search ? 'No members match your search.' : (
                      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                        No members yet.
                        <button className="adash-btn adash-btn-primary adash-btn-sm" onClick={() => { setForm(emptyForm); setModal(true) }}>+ Add the first member</button>
                      </span>
                    )}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <AdminModal titleId="adm-member-detail" onClose={() => setSelected(null)}>
          <div className="adash-modal-head">
            <div>
              <h2 id="adm-member-detail">{[selected.title, selected.firstName, selected.lastName].filter(Boolean).join(' ')}</h2>
              <p>{selected.email} · member since {new Date(selected.createdAt).toLocaleDateString('en-GB')}</p>
            </div>
            <button type="button" className="adash-modal-close" onClick={() => setSelected(null)} aria-label="Close">×</button>
          </div>
          <div className="adash-dl">
            <div className="full"><div className="adash-dt">Email</div><div className="adash-dd">{selected.email}</div></div>
            <div><div className="adash-dt">Phone</div><div className="adash-dd">{selected.phone || '—'}</div></div>
            <div><div className="adash-dt">City</div><div className="adash-dd">{selected.city || '—'}</div></div>
            <div><div className="adash-dt">Country</div><div className="adash-dd">{selected.country || '—'}</div></div>
            <div><div className="adash-dt">Status</div><div className="adash-dd"><span className={`adash-pill is-${selected.status}`}>{selected.status}</span></div></div>
            <div><div className="adash-dt">Role</div><div className="adash-dd">{selected.role}</div></div>
            <div><div className="adash-dt">Preferred language</div><div className="adash-dd">{selected.preferredLanguage === 'en' ? 'English' : 'Français'}</div></div>
            <div><div className="adash-dt">Referral code</div><div className="adash-dd adash-mono">{selected.referralCode}</div></div>
            <div><div className="adash-dt">Referrals</div><div className="adash-dd">{selected.successfulReferrals} accepted / {selected.referralCount} sent</div></div>
            <div><div className="adash-dt">Free months earned</div><div className="adash-dd">{selected.successfulReferrals}</div></div>
            <div className="full"><div className="adash-dt">Last login</div><div className="adash-dd muted">{selected.lastLoginAt ? new Date(selected.lastLoginAt).toLocaleString() : 'Never'}</div></div>
            <div className="full"><div className="adash-dt">Password</div><div className="adash-dd muted">{selected.mustChangePassword ? 'Temporary — reset pending' : 'Set by member'}</div></div>
          </div>
          <div className="adash-detail-foot">
            <button type="button" className="adash-btn adash-btn-ghost adash-btn-sm" onClick={() => { const m = selected; setSelected(null); void handleReset(m) }}>Reset password</button>
            <button type="button" className="adash-btn adash-btn-ghost adash-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setSelected(null)}>Close</button>
          </div>
        </AdminModal>
      )}

      {modal && (
        <AdminModal titleId="adm-create-member" onClose={() => setModal(false)}>
          <form onSubmit={handleCreate} style={{ display: 'contents' }}>
            <div className="adash-modal-head">
              <div><h2 id="adm-create-member">Add a member</h2><p>Generates a temporary password + referral code.</p></div>
              <button type="button" className="adash-modal-close" onClick={() => setModal(false)} aria-label="Close">×</button>
            </div>
            <div className="adash-form-grid">
              <div className="adash-field">
                <label>Title</label>
                <select className="adash-select" value={form.title} onChange={set('title')}>
                  <option value="">—</option><option value="Mr">Mr</option><option value="Ms">Ms</option><option value="Mme">Mme</option><option value="M.">M.</option>
                </select>
              </div>
              <div className="adash-field">
                <label>Language</label>
                <select className="adash-select" value={form.language} onChange={set('language')}><option value="fr">Français</option><option value="en">English</option></select>
              </div>
              <div className="adash-field"><label>First name *</label><input className="adash-input" value={form.firstName} onChange={set('firstName')} required /></div>
              <div className="adash-field"><label>Last name *</label><input className="adash-input" value={form.lastName} onChange={set('lastName')} required /></div>
              <div className="adash-field full"><label>Email *</label><input className="adash-input" type="email" value={form.email} onChange={set('email')} required /></div>
              <div className="adash-field"><label>Phone</label><input className="adash-input" value={form.phone} onChange={set('phone')} /></div>
              <div className="adash-field"><label>City</label><input className="adash-input" value={form.city} onChange={set('city')} /></div>
              <div className="adash-field"><label>Country</label><input className="adash-input" value={form.country} onChange={set('country')} /></div>
              <div className="adash-field"><label>Contract ref.</label><input className="adash-input" value={form.contractRef} onChange={set('contractRef')} /></div>
              <div className="adash-field full"><label>Notes</label><textarea className="adash-input adash-textarea" value={form.notes} onChange={set('notes')} /></div>
            </div>
            <label className="adash-check">
              <input type="checkbox" checked={form.sendEmail} onChange={(e) => setForm((f) => ({ ...f, sendEmail: e.target.checked }))} />
              <span>Email the credentials to the member immediately</span>
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="adash-btn adash-btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button type="submit" className="adash-btn adash-btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create member'}</button>
            </div>
          </form>
        </AdminModal>
      )}
    </>
  )
}
