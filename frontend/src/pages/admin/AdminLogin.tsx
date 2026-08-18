import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../../contexts/AdminAuthContext'
import AdminGate from '../../components/admin/AdminGate'
import { AdminField, AdminPasswordInput, AdminTextInput } from '../../components/admin/adminUi'

export default function AdminLogin() {
  const { token, admin, loading, login } = useAdminAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { document.title = 'Sign in · Admin · Pavillon 46' }, [])

  if (loading) return <AdminGate title="Sign in" loading />
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
    <AdminGate
      title="Welcome back"
      subtitle="Sign in to manage members, referrals and the life of the site."
      footer={
        <p className="adash-auth-links">
          <Link to="/admin/forgot-password">Forgot password?</Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="adash-auth-form-fields">
        <AdminField label="Email">
          <AdminTextInput
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="you@pavillon46.ch"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </AdminField>
        <AdminField label="Password">
          <AdminPasswordInput
            show={show}
            onToggle={() => setShow((s) => !s)}
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </AdminField>
        {error && <p className="adash-auth-error" role="alert">{error}</p>}
        <button type="submit" className="adash-auth-submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Enter the console'}
        </button>
      </form>
    </AdminGate>
  )
}
