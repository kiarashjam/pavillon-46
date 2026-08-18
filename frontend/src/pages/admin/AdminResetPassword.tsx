import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { adminAuthResetPassword, ApiError } from '../../lib/api'
import AdminGate from '../../components/admin/AdminGate'
import { AdminField, AdminPasswordInput, AdminPasswordMeter } from '../../components/admin/adminUi'

export default function AdminResetPassword() {
  const [params] = useSearchParams()
  const token = (params.get('token') ?? '').trim()

  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invalidToken, setInvalidToken] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => { document.title = 'Reset password · Admin · Pavillon 46' }, [])

  const missingToken = !token
  const mismatch = confirm.length > 0 && pw !== confirm

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting || success) return
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
      await adminAuthResetPassword(token, pw)
      setSuccess(true)
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/admin/reset-password')
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const isTokenError =
          err.status === 401 ||
          err.errorType === 'invalid' ||
          err.errorType === 'expired' ||
          err.errorType === 'mismatch'
        if (isTokenError) {
          setInvalidToken(true)
        } else if (err.status === 429) {
          setError('Too many attempts. Please try again later.')
        } else if (err.errorType === 'weak_password') {
          setError('Your new password must be at least 8 characters.')
        } else {
          setError(err.message || 'Could not save the password. Please try again.')
        }
      } else {
        setError('Could not save the password. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (missingToken || invalidToken) {
    return (
      <AdminGate
        title="This link has expired"
        subtitle={
          missingToken
            ? 'This reset link is incomplete. Request a new one from the forgot-password page.'
            : 'This link is invalid or has expired. Request a new one — it only works once.'
        }
        footer={
          <p className="adash-auth-links">
            <Link to="/admin/forgot-password">Request a new link</Link>
            <span aria-hidden="true"> · </span>
            <Link to="/admin/login">Sign in</Link>
          </p>
        }
      />
    )
  }

  if (success) {
    return (
      <AdminGate
        title="Password updated"
        subtitle="Your admin password has been saved. You can sign in with it now."
        footer={
          <p className="adash-auth-links">
            <Link to="/admin/login">Go to sign in</Link>
          </p>
        }
      >
        <div className="adash-auth-sent">
          <span className="adash-auth-sent-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
              <path d="m8 12.2 2.6 2.6L16.4 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </AdminGate>
    )
  }

  return (
    <AdminGate
      title="Choose a new password"
      subtitle="At least 8 characters. This signs out every other admin session on this account."
      footer={
        <p className="adash-auth-links">
          <Link to="/admin/login">Back to sign in</Link>
        </p>
      }
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
            disabled={submitting}
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
            disabled={submitting}
          />
        </AdminField>
        {mismatch && <p className="adash-auth-hint-warn">The two passwords do not match yet.</p>}
        {error && <p className="adash-auth-error" role="alert">{error}</p>}
        <button type="submit" className="adash-auth-submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </AdminGate>
  )
}
