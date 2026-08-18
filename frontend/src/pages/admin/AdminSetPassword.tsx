import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../../contexts/AdminAuthContext'
import { adminChangePassword } from '../../lib/api'
import AdminGate from '../../components/admin/AdminGate'
import { AdminField, AdminPasswordInput, AdminPasswordMeter } from '../../components/admin/adminUi'

export default function AdminSetPassword() {
  const { token, admin, loading, applySession } = useAdminAuth()
  const navigate = useNavigate()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { document.title = 'Set password · Admin · Pavillon 46' }, [])

  if (loading) return <AdminGate title="Set a new password" loading />
  if (!token) return <Navigate to="/admin/login" replace />
  // An admin who has already set their password shouldn't see this screen.
  if (admin && !admin.mustChangePassword) return <Navigate to="/admin" replace />

  const mismatch = confirm.length > 0 && pw !== confirm

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    if (pw.length < 8) {
      setError('Your new password must be at least 8 characters.')
      return
    }
    if (pw !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const result = await adminChangePassword(token, pw)
      applySession(result.token, result.admin)
      navigate('/admin', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set your password.')
      setSubmitting(false)
    }
  }

  const first = admin?.firstName?.trim()
  const hello = first ? `${first}, one more step` : 'One more step'

  return (
    <AdminGate
      title={hello}
      subtitle="Choose a password to secure your admin desk. Temporary credentials stop working after this."
    >
      <form onSubmit={handleSubmit} className="adash-auth-form-fields">
        <AdminField label="New password">
          <AdminPasswordInput
            show={show}
            onToggle={() => setShow((s) => !s)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
          />
        </AdminField>
        <AdminPasswordMeter password={pw} />
        <AdminField label="Confirm password">
          <AdminPasswordInput
            show={show}
            onToggle={() => setShow((s) => !s)}
            autoComplete="new-password"
            placeholder="Type it again"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </AdminField>
        {mismatch && <p className="adash-auth-hint-warn">The two passwords do not match yet.</p>}
        {error && <p className="adash-auth-error" role="alert">{error}</p>}
        <button type="submit" className="adash-auth-submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save and enter'}
        </button>
      </form>
    </AdminGate>
  )
}
