import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { IMAGE_PATHS } from '../../lib/constants'
import { EASE_SMOOTH_OUT } from '../../lib/motion'
import { adminAuthResetPassword, ApiError } from '../../lib/api'

export default function AdminResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invalidToken, setInvalidToken] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => { document.title = 'Reset password · Admin · Pavillon 46' }, [])

  const missingToken = !token

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
          err.errorType === 'expired'
        if (isTokenError) {
          setInvalidToken(true)
        } else if (err.status === 429) {
          setError('Too many attempts. Please try again later.')
        } else if (err.errorType === 'weak_password') {
          setError('Your new password must be at least 8 characters.')
        } else if (err.errorType === 'mismatch') {
          setError('The two passwords do not match.')
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

  const shell = (children: ReactNode) => (
    <div className="adash">
      <div className="adash-ambient" aria-hidden="true" />
      <div className="adash-grain" aria-hidden="true" />
      <motion.div
        className="adash-gate"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_SMOOTH_OUT }}
      >
        <img className="adash-gate-brand" src={IMAGE_PATHS.logo} alt="Pavillon 46" />
        <span className="adash-gate-eyebrow">Admin console</span>
        {children}
      </motion.div>
    </div>
  )

  if (missingToken || invalidToken) {
    return shell(
      <>
        <h1>New password</h1>
        <p className="adash-error">
          {missingToken
            ? 'This reset link is incomplete.'
            : 'This link is invalid or has expired. Please request a new one.'}
        </p>
        <p className="adash-gate-links">
          <Link to="/admin/forgot-password" className="adash-link">Forgot password?</Link>
        </p>
      </>,
    )
  }

  return shell(
    <>
      <h1>New password</h1>
      <p>Choose a new password for your admin account.</p>
      {success ? (
        <>
          <p className="adash-success">Your password has been updated. You can now sign in.</p>
          <p className="adash-gate-links">
            <Link to="/admin/login" className="adash-link">Go to sign in</Link>
          </p>
        </>
      ) : (
        <>
          <form onSubmit={handleSubmit}>
            <div className="adash-pw">
              <input
                className="adash-input"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="New password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                aria-label="New password"
                disabled={submitting}
                autoFocus
              />
              <button type="button" className="adash-pw-toggle" aria-pressed={show} onClick={() => setShow((s) => !s)}>
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              className="adash-input"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-label="Confirm password"
              disabled={submitting}
            />
            {error && <p className="adash-error">{error}</p>}
            <button type="submit" className="adash-btn adash-btn-primary" disabled={submitting} style={{ justifyContent: 'center' }}>
              {submitting ? 'Saving…' : 'Save password'}
            </button>
          </form>
          <p className="adash-gate-links">
            <Link to="/admin/login" className="adash-link">Back to sign in</Link>
          </p>
        </>
      )}
    </>,
  )
}
