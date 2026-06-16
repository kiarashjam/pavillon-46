import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { IMAGE_PATHS } from '../../lib/constants'
import { EASE_SMOOTH_OUT } from '../../lib/motion'
import { useAdminAuth } from '../../contexts/AdminAuthContext'

export default function AdminLogin() {
  const { token, admin, loading, login } = useAdminAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { document.title = 'Admin · Pavillon 46' }, [])

  if (loading) {
    return (
      <div className="adash">
        <div className="adash-ambient" aria-hidden="true" />
        <div className="adash-loading" style={{ margin: 'auto', zIndex: 2 }}>Loading…</div>
      </div>
    )
  }
  if (token && admin?.mustChangePassword) return <Navigate to="/admin/set-password" replace />
  if (token) return <Navigate to="/admin" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const a = await login(email.trim(), password)
      navigate(a.mustChangePassword ? '/admin/set-password' : '/admin', { replace: true })
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Sign in failed.')
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
        <h1>Sign in</h1>
        <p>Manage members, referrals and analytics.</p>
        <form onSubmit={handleSubmit}>
          <input
            className="adash-input"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email"
            autoFocus
          />
          <div className="adash-pw">
            <input
              className="adash-input"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="Password"
            />
            <button type="button" className="adash-pw-toggle" aria-pressed={show} onClick={() => setShow((s) => !s)}>
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
          <button type="submit" className="adash-btn adash-btn-primary" disabled={submitting} style={{ justifyContent: 'center' }}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {error && <p className="adash-error">{error}</p>}
      </motion.div>
    </div>
  )
}
