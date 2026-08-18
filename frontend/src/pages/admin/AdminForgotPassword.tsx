import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { IMAGE_PATHS } from '../../lib/constants'
import { EASE_SMOOTH_OUT } from '../../lib/motion'
import { adminForgotPassword, ApiError } from '../../lib/api'

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
      // Never reveal whether the admin email exists. Rate limits are safe to
      // surface; every other failure flips to the same neutral success state.
      if (err instanceof ApiError && err.status === 429) {
        setError('Too many attempts. Please try again in a few minutes.')
      } else {
        setSubmitted(true)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
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
        <h1>Forgot password</h1>
        <p>Enter your email and we’ll send a reset link if an admin account exists.</p>
        <form onSubmit={handleSubmit}>
          <input
            className="adash-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email"
            autoFocus
            disabled={submitting || submitted}
          />
          {error && <p className="adash-error">{error}</p>}
          {submitted && (
            <p className="adash-success">If an admin account exists with that email, we’ve sent you a link.</p>
          )}
          <button type="submit" className="adash-btn adash-btn-primary" disabled={submitting || submitted} style={{ justifyContent: 'center' }}>
            {submitting ? 'Sending…' : 'Send the link'}
          </button>
        </form>
        <p className="adash-gate-links">
          <Link to="/admin/login" className="adash-link">Back to sign in</Link>
        </p>
      </motion.div>
    </div>
  )
}
