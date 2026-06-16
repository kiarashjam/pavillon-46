import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { IMAGE_PATHS } from '../../lib/constants'
import { EASE_SMOOTH_OUT } from '../../lib/motion'
import { useAdminAuth } from '../../contexts/AdminAuthContext'
import { adminChangePassword } from '../../lib/api'

export default function AdminSetPassword() {
  const { token, admin, loading, setAdmin } = useAdminAuth()
  const navigate = useNavigate()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { document.title = 'Set password · Pavillon 46' }, [])

  if (loading) {
    return (
      <div className="adash">
        <div className="adash-ambient" aria-hidden="true" />
        <div className="adash-loading" style={{ margin: 'auto', zIndex: 2 }}>Loading…</div>
      </div>
    )
  }
  if (!token) return <Navigate to="/admin/login" replace />
  // An admin who has already set their password shouldn't see this screen.
  if (admin && !admin.mustChangePassword) return <Navigate to="/admin" replace />

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
      const updated = await adminChangePassword(token, pw)
      setAdmin(updated)
      navigate('/admin', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set your password.')
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
        <h1>Set a new password</h1>
        <p>Choose a password to secure your admin account.</p>
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
          />
          <button type="submit" className="adash-btn adash-btn-primary" disabled={submitting} style={{ justifyContent: 'center' }}>
            {submitting ? 'Saving…' : 'Save password'}
          </button>
        </form>
        {error && <p className="adash-error">{error}</p>}
      </motion.div>
    </div>
  )
}
