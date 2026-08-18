import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminForgotPassword, ApiError } from '../../lib/api'
import AdminGate from '../../components/admin/AdminGate'
import { AdminField, AdminTextInput } from '../../components/admin/adminUi'

export default function AdminForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { document.title = 'Forgot password · Admin · Pavillon 46' }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting || submitted) return
    const trimmed = email.trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await adminForgotPassword(trimmed.toLowerCase())
      setSubmitted(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('Too many attempts. Please try again in a few minutes.')
      } else if (err instanceof ApiError && (err.errorType === 'not_admin' || err.status === 404)) {
        setError('You are not part of the admin desk. Check the email and try again — or use member sign-in if you have a membership.')
      } else {
        setError('We could not send the link. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminGate
      title={submitted ? 'Check your inbox' : 'Forgot password'}
      subtitle={
        submitted
          ? 'We’ve sent a reset link to that admin email.'
          : 'Enter the email of your admin account and we’ll send a reset link.'
      }
      footer={
        <p className="adash-auth-links">
          <Link to="/admin/login">Back to sign in</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/login">Member sign-in</Link>
        </p>
      }
    >
      {submitted ? (
        <div className="adash-auth-sent">
          <span className="adash-auth-sent-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
              <path d="m8 12.2 2.6 2.6L16.4 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p>The link expires shortly. If nothing arrives, check spam — or request another from this page later.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="adash-auth-form-fields">
          <AdminField label="Email">
            <AdminTextInput
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="you@pavillon46.ch"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (error) setError(null) }}
              autoFocus
              disabled={submitting}
            />
          </AdminField>
          {error && <p className="adash-auth-error" role="alert">{error}</p>}
          <button type="submit" className="adash-auth-submit" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send the link'}
          </button>
        </form>
      )}
    </AdminGate>
  )
}
