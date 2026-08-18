import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  adminListAdmins,
  adminCreateAdmin,
  adminUpdateAdmin,
  adminDeleteAdmin,
  adminResetAdminPassword,
  type AdminDto,
  type CreateAdminBody,
  type CreateAdminResponse,
  type UpdateAdminBody,
} from '../../lib/api'
import type { AdminCtx } from '../../components/admin/AdminLayout'
import AdminModal from '../../components/admin/AdminModal'
import { AdminEmpty, AdminSkeletonRows } from '../../components/admin/adminUi'
import { adminInitials } from '../../components/admin/adminHelpers'
import { useAdminAuth } from '../../contexts/AdminAuthContext'

const emptyForm: CreateAdminBody = { title: '', firstName: '', lastName: '', email: '', sendEmail: true }

export default function AdminAdminsSection({ embedded = false }: { embedded?: boolean }) {
  const { token } = useOutletContext<AdminCtx>()
  const { admin: me } = useAdminAuth()
  const [admins, setAdmins] = useState<AdminDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<CreateAdminBody>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<CreateAdminResponse | null>(null)
  const [editing, setEditing] = useState<AdminDto | null>(null)
  const [editForm, setEditForm] = useState<UpdateAdminBody>({})
  const [editBusy, setEditBusy] = useState(false)

  const load = () => {
    setLoading(true)
    adminListAdmins(token)
      .then((d) => setAdmins(d.admins))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [token])

  const set = (k: keyof CreateAdminBody) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return admins
    return admins.filter((a) => `${a.title} ${a.firstName} ${a.lastName} ${a.email}`.toLowerCase().includes(q))
  }, [admins, search])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await adminCreateAdmin(token, form)
      setCreated(res); setForm(emptyForm); setModal(false); load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create admin')
    } finally { setBusy(false) }
  }

  const openEdit = (a: AdminDto) => {
    setError(null)
    setEditForm({ title: a.title, firstName: a.firstName, lastName: a.lastName, email: a.email, status: a.status || 'active' })
    setEditing(a)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setEditBusy(true); setError(null)
    try {
      await adminUpdateAdmin(token, editing.id, editForm)
      setEditing(null); load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update admin')
    } finally { setEditBusy(false) }
  }

  const handleDelete = async (a: AdminDto) => {
    if (a.id === me?.id) return
    if (!window.confirm(`Remove ${`${a.firstName} ${a.lastName}`.trim() || a.email} from the desk? They will no longer be able to sign in.`)) return
    setError(null)
    try {
      await adminDeleteAdmin(token, a.id)
      setEditing(null); load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to delete admin') }
  }

  const handleReset = async (a: AdminDto) => {
    if (!window.confirm(`Generate a new password for ${a.email}? Their current sessions will end.`)) return
    setError(null)
    try {
      const res = await adminResetAdminPassword(token, a.id, false)
      setCreated(res); setEditing(null)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to reset password') }
  }

  const copy = (v: string) => void navigator.clipboard?.writeText(v)
  const nameOf = (a: AdminDto) => [a.title, a.firstName, a.lastName].filter(Boolean).join(' ') || a.email

  return (
    <>
      {!embedded && (
        <div className="adash-head">
          <div>
            <p className="adash-kicker">The desk</p>
            <h2>Admins</h2>
            <p>{admins.length} admin{admins.length === 1 ? '' : 's'} with a key to the console.</p>
          </div>
        </div>
      )}

      <div className="adash-head-actions adash-people-toolbar">
        <div className="adash-search">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" /><path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
          <input className="adash-input" aria-label="Search admins" placeholder="Search admins…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="adash-btn adash-btn-primary" onClick={() => { setError(null); setForm(emptyForm); setModal(true) }}>Add admin</button>
      </div>

      {error && <p className="adash-error">{error}</p>}

      {created && (
        <div className="adash-creds">
          <h3>Admin credentials — copy now (shown once)</h3>
          <div className="adash-cred-row">
            <div><span>Email</span><strong>{created.admin.email}</strong></div>
            <button className="adash-btn adash-btn-ghost adash-btn-sm" onClick={() => copy(created.admin.email)}>Copy</button>
          </div>
          <div className="adash-cred-row">
            <div><span>Temporary password</span><strong className="adash-mono">{created.password}</strong></div>
            <button className="adash-btn adash-btn-ghost adash-btn-sm" onClick={() => copy(created.password)}>Copy</button>
          </div>
          <div className="adash-cred-actions">
            {created.emailSent && <span className="adash-hint">Already emailed.</span>}
            {created.emailError && <span className="adash-hint warn">Email error: {created.emailError}</span>}
            <button className="adash-link" onClick={() => setCreated(null)} style={{ marginLeft: 'auto' }}>Dismiss</button>
          </div>
        </div>
      )}

      <div className="adash-panel adash-panel-flush">
        {loading ? <AdminSkeletonRows rows={4} /> : (
          <div className="adash-table-wrap">
            <table className="adash-table">
              <thead><tr><th>Admin</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
              <tbody>
                {filtered.map((a) => {
                  const isYou = a.id === me?.id
                  return (
                    <tr key={a.id} className="adash-row-clickable" role="button" tabIndex={0}
                      aria-label={`Edit ${nameOf(a)}`}
                      onClick={() => openEdit(a)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEdit(a) } }}>
                      <td>
                        <div className="adash-person">
                          <span className="adash-ava adash-ava-admin">{adminInitials(a.firstName, a.lastName, a.email)}</span>
                          <span className="adash-person-info">
                            <span className="adash-person-name">
                              {nameOf(a)}
                              {isYou && <span className="adash-you">You</span>}
                            </span>
                            <span className="adash-person-sub">{a.email}</span>
                          </span>
                        </div>
                      </td>
                      <td><span className={`adash-pill is-${a.status || 'active'}`}>{a.status || 'active'}</span></td>
                      <td className="adash-person-sub">{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : 'Never'}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button className="adash-btn adash-btn-ghost adash-btn-sm" onClick={() => openEdit(a)}>Edit</button>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={4}>
                    <AdminEmpty
                      title={search ? 'No admins match that search' : 'No admins yet'}
                      hint={search ? 'Try another name or email.' : 'Invite the first colleague to the desk.'}
                      action={!search ? (
                        <button className="adash-btn adash-btn-primary adash-btn-sm" onClick={() => { setError(null); setForm(emptyForm); setModal(true) }}>Add an admin</button>
                      ) : undefined}
                    />
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <AdminModal titleId="adm-create-admin" onClose={() => setModal(false)}>
          <form onSubmit={handleCreate} style={{ display: 'contents' }}>
            <div className="adash-modal-head">
              <div><h2 id="adm-create-admin">Add an admin</h2><p>Opens a desk key. They set their own password on first sign-in.</p></div>
              <button type="button" className="adash-modal-close" onClick={() => setModal(false)} aria-label="Close">×</button>
            </div>
            <div className="adash-form-grid">
              <div className="adash-field">
                <label>Title</label>
                <select className="adash-select" value={form.title} onChange={set('title')}>
                  <option value="">—</option><option value="Mr">Mr</option><option value="Ms">Ms</option><option value="Mme">Mme</option><option value="M.">M.</option>
                </select>
              </div>
              <div className="adash-field"><label>First name *</label><input className="adash-input" value={form.firstName} onChange={set('firstName')} required /></div>
              <div className="adash-field"><label>Last name *</label><input className="adash-input" value={form.lastName} onChange={set('lastName')} required /></div>
              <div className="adash-field full"><label>Email *</label><input className="adash-input" type="email" value={form.email} onChange={set('email')} required /></div>
            </div>
            <label className="adash-check">
              <input type="checkbox" checked={form.sendEmail} onChange={(e) => setForm((f) => ({ ...f, sendEmail: e.target.checked }))} />
              <span>Email the credentials immediately</span>
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="adash-btn adash-btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button type="submit" className="adash-btn adash-btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create admin'}</button>
            </div>
          </form>
        </AdminModal>
      )}

      {editing && (
        <AdminModal titleId="adm-edit-admin" onClose={() => setEditing(null)}>
          <form onSubmit={handleEdit} style={{ display: 'contents' }}>
            <div className="adash-modal-head">
              <div><h2 id="adm-edit-admin">Edit admin</h2><p>{editing.email}{editing.id === me?.id ? ' · this is you' : ''}</p></div>
              <button type="button" className="adash-modal-close" onClick={() => setEditing(null)} aria-label="Close">×</button>
            </div>
            <div className="adash-form-grid">
              <div className="adash-field">
                <label>Title</label>
                <select className="adash-select" value={editForm.title ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}>
                  <option value="">—</option><option value="Mr">Mr</option><option value="Ms">Ms</option><option value="Mme">Mme</option><option value="M.">M.</option>
                </select>
              </div>
              <div className="adash-field">
                <label>Status</label>
                <select className="adash-select" value={editForm.status ?? 'active'} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))} disabled={editing.id === me?.id}>
                  <option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option>
                </select>
              </div>
              <div className="adash-field"><label>First name</label><input className="adash-input" value={editForm.firstName ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))} /></div>
              <div className="adash-field"><label>Last name</label><input className="adash-input" value={editForm.lastName ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))} /></div>
              <div className="adash-field full"><label>Email</label><input className="adash-input" type="email" value={editForm.email ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} /></div>
            </div>
            {editing.id === me?.id && <p className="adash-hint">You cannot deactivate or delete your own account.</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="adash-btn adash-btn-ghost" onClick={() => handleReset(editing)}>Reset password</button>
                {editing.id !== me?.id && (
                  <button type="button" className="adash-btn adash-btn-danger" onClick={() => handleDelete(editing)}>Remove</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
                <button type="button" className="adash-btn adash-btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" className="adash-btn adash-btn-primary" disabled={editBusy}>{editBusy ? 'Saving…' : 'Save changes'}</button>
              </div>
            </div>
          </form>
        </AdminModal>
      )}
    </>
  )
}
