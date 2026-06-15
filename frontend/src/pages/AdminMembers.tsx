import { useEffect, useState } from 'react'
import {
  adminCreateMember,
  adminListApplicants,
  adminListMembers,
  adminResetPassword,
  adminSendCredentials,
  adminUpdateApplicant,
  type AdminApplicantsResponse,
  type ApplicantDto,
  type CreateMemberBody,
  type CreateMemberResponse,
  type MemberDto,
} from '../lib/api'

const KEY_STORAGE = 'pavillon46_activity_report_key'

const emptyForm: CreateMemberBody = {
  title: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  city: '',
  country: '',
  contractRef: '',
  notes: '',
  language: 'fr',
  sendEmail: true,
}

export default function AdminMembers() {
  const [keyInput, setKeyInput] = useState(() => localStorage.getItem(KEY_STORAGE) ?? '')
  const [submittedKey, setSubmittedKey] = useState<string | null>(null)
  const [tab, setTab] = useState<'members' | 'applicants'>('members')

  const [form, setForm] = useState<CreateMemberBody>(emptyForm)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<CreateMemberResponse | null>(null)
  const [sendState, setSendState] = useState<string | null>(null)

  const [members, setMembers] = useState<MemberDto[]>([])
  const [applicants, setApplicants] = useState<AdminApplicantsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    document.title = 'Member Admin — Pavillon 46'
  }, [])

  const loadAll = async (key: string) => {
    setLoading(true)
    setError(null)
    try {
      const [m, a] = await Promise.all([adminListMembers(key), adminListApplicants(key)])
      setMembers(m.members)
      setApplicants(a)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = keyInput.trim()
    if (!trimmed) return
    localStorage.setItem(KEY_STORAGE, trimmed)
    setSubmittedKey(trimmed)
    void loadAll(trimmed)
  }

  const set = (key: keyof CreateMemberBody) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!submittedKey) return
    setCreating(true)
    setError(null)
    setCreated(null)
    setSendState(null)
    try {
      const res = await adminCreateMember(submittedKey, form)
      setCreated(res)
      setForm(emptyForm)
      void loadAll(submittedKey)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create member')
    } finally {
      setCreating(false)
    }
  }

  const handleSendCredentials = async () => {
    if (!submittedKey || !created) return
    setSendState('sending')
    try {
      await adminSendCredentials(submittedKey, { memberId: created.member.id, password: created.password })
      setSendState('sent')
    } catch (err) {
      setSendState(err instanceof Error ? err.message : 'Failed to send')
    }
  }

  const handleReset = async (member: MemberDto) => {
    if (!submittedKey) return
    if (!window.confirm(`Generate a new password for ${member.email}?`)) return
    try {
      const res = await adminResetPassword(submittedKey, member.id, false)
      setCreated(res)
      setSendState(null)
      setTab('members')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password')
    }
  }

  const handleStatus = async (applicant: ApplicantDto, status: ApplicantDto['status']) => {
    if (!submittedKey) return
    try {
      await adminUpdateApplicant(submittedKey, applicant.id, status)
      void loadAll(submittedKey)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  const copy = (value: string) => {
    void navigator.clipboard?.writeText(value)
  }

  if (!submittedKey) {
    return (
      <div className="activity-admin-page">
        <div className="activity-auth-card">
          <h1>Member Admin</h1>
          <p className="activity-subtle-text">Enter the admin key to manage members and applicants.</p>
          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="password"
              className="activity-auth-input"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              autoComplete="off"
              placeholder="Admin key"
              required
            />
            <button type="submit" className="activity-primary-btn">Enter</button>
          </form>
          {error && <p className="activity-error">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="activity-admin-page">
      <div className="activity-header-panel">
        <div className="activity-header-copy">
          <h1>Member Admin</h1>
          <p className="activity-subtle-text">Create contracted members, send their credentials, and review referrals.</p>
        </div>
        <div className="activity-header-actions">
          <button className={`adm-tab${tab === 'members' ? ' is-active' : ''}`} onClick={() => setTab('members')}>
            Members ({members.length})
          </button>
          <button className={`adm-tab${tab === 'applicants' ? ' is-active' : ''}`} onClick={() => setTab('applicants')}>
            Applicants ({applicants?.total ?? 0})
          </button>
          <button className="activity-secondary-btn" onClick={() => void loadAll(submittedKey)} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <p className="activity-error">{error}</p>}

      {created && (
        <div className="adm-credentials-card">
          <h2>New credentials generated</h2>
          <p className="activity-subtle-text">Copy these now — the password is shown only once.</p>
          <div className="adm-cred-row">
            <div>
              <span>Email</span>
              <strong>{created.member.email}</strong>
            </div>
            <button className="activity-secondary-btn" onClick={() => copy(created.member.email)}>Copy</button>
          </div>
          <div className="adm-cred-row">
            <div>
              <span>Password</span>
              <strong className="adm-mono">{created.password}</strong>
            </div>
            <button className="activity-secondary-btn" onClick={() => copy(created.password)}>Copy</button>
          </div>
          <div className="adm-cred-actions">
            <button className="activity-primary-btn" onClick={handleSendCredentials} disabled={sendState === 'sending'}>
              {sendState === 'sending' ? 'Sending…' : sendState === 'sent' ? 'Email sent ✓' : 'Send credentials by email'}
            </button>
            {created.emailSent && <span className="adm-hint">Already emailed on creation.</span>}
            {created.emailError && <span className="adm-hint adm-hint-warn">Email error: {created.emailError}</span>}
            {sendState && sendState !== 'sending' && sendState !== 'sent' && <span className="adm-hint adm-hint-warn">{sendState}</span>}
          </div>
        </div>
      )}

      {tab === 'members' && (
        <>
          <form className="adm-panel" onSubmit={handleCreate}>
            <h2>Add a member</h2>
            <div className="adm-form-grid">
              <label>
                <span>Title</span>
                <select value={form.title} onChange={set('title')}>
                  <option value="">—</option>
                  <option value="Mr">Mr</option>
                  <option value="Ms">Ms</option>
                  <option value="Mme">Mme</option>
                  <option value="M.">M.</option>
                </select>
              </label>
              <label><span>First name *</span><input value={form.firstName} onChange={set('firstName')} required /></label>
              <label><span>Last name *</span><input value={form.lastName} onChange={set('lastName')} required /></label>
              <label><span>Email *</span><input type="email" value={form.email} onChange={set('email')} required /></label>
              <label><span>Phone</span><input value={form.phone} onChange={set('phone')} /></label>
              <label><span>City</span><input value={form.city} onChange={set('city')} /></label>
              <label><span>Country</span><input value={form.country} onChange={set('country')} /></label>
              <label><span>Contract ref.</span><input value={form.contractRef} onChange={set('contractRef')} /></label>
              <label>
                <span>Language</span>
                <select value={form.language} onChange={set('language')}>
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
              </label>
            </div>
            <label className="adm-full"><span>Notes</span><textarea value={form.notes} onChange={set('notes')} rows={2} /></label>
            <label className="adm-checkbox">
              <input
                type="checkbox"
                checked={form.sendEmail}
                onChange={(e) => setForm((f) => ({ ...f, sendEmail: e.target.checked }))}
              />
              <span>Email the credentials to the member immediately</span>
            </label>
            <button type="submit" className="activity-primary-btn" disabled={creating}>
              {creating ? 'Creating…' : 'Create member & generate password'}
            </button>
          </form>

          <div className="activity-events-panel">
            <h2>Members</h2>
            <div className="activity-events-table-wrap">
              <table className="activity-events-table">
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Referral code</th><th>Referrals</th><th>Bonus</th><th>Status</th><th /></tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td>{`${m.firstName} ${m.lastName}`.trim()}</td>
                      <td>{m.email}</td>
                      <td className="adm-mono">{m.referralCode}</td>
                      <td>{m.successfulReferrals}/{m.referralCount}</td>
                      <td>{m.bonusPoints}</td>
                      <td>{m.status}</td>
                      <td><button className="activity-secondary-btn" onClick={() => handleReset(m)}>Reset pw</button></td>
                    </tr>
                  ))}
                  {members.length === 0 && <tr><td colSpan={7} className="activity-empty">No members yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'applicants' && (
        <div className="activity-events-panel">
          <h2>Applicants (referrals)</h2>
          <div className="activity-events-table-wrap">
            <table className="activity-events-table">
              <thead>
                <tr><th>Name</th><th>Contact</th><th>Referred by</th><th>Code</th><th>Date</th><th>Status</th></tr>
              </thead>
              <tbody>
                {(applicants?.applicants ?? []).map((a) => (
                  <tr key={a.id}>
                    <td>{`${a.firstName} ${a.lastName}`.trim()}</td>
                    <td>{a.email || a.phone || '—'}</td>
                    <td>{a.referrerName || '—'}</td>
                    <td className="adm-mono">{a.applicationCode}</td>
                    <td>{new Date(a.createdAt).toLocaleDateString()}</td>
                    <td>
                      <select
                        value={a.status}
                        onChange={(e) => handleStatus(a, e.target.value as ApplicantDto['status'])}
                        className={`adm-status-select is-${a.status}`}
                      >
                        <option value="pending">Pending</option>
                        <option value="reviewing">Reviewing</option>
                        <option value="accepted">Accepted</option>
                        <option value="declined">Declined</option>
                      </select>
                    </td>
                  </tr>
                ))}
                {(applicants?.applicants.length ?? 0) === 0 && (
                  <tr><td colSpan={6} className="activity-empty">No applicants yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
