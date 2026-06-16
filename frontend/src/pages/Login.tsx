import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import AuthLayout from '../components/AuthLayout'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { useTranslations } from '../lib/translations'
import { animationVariants } from '../lib/constants'

export default function Login() {
  const { language } = useLanguage()
  const { token, login } = useAuth()
  const navigate = useNavigate()
  const t = useTranslations(language, 'login')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = t.title
  }, [t.title])

  if (token) {
    return <Navigate to="/dashboard" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!account.trim() || !password) {
      setError(t.validationError)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const member = await login(account.trim(), password)
      navigate(member.mustChangePassword ? '/set-password' : '/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t.failed)
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <motion.div
        className="login-form-container"
        variants={animationVariants.form}
        initial="hidden"
        animate="visible"
      >
            <h1 className="form-heading login-heading">{t.heading}</h1>
            <p className="form-subtitle login-subtitle">{t.subtitle}</p>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-field">
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  placeholder={t.accountPlaceholder}
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  className="form-input login-input"
                  aria-label={t.accountPlaceholder}
                />
              </div>

              <div className="login-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder={t.passwordPlaceholder}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-input login-input password-input"
                  aria-label={t.passwordPlaceholder}
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? t.hidePassword : t.showPassword}
                </button>
              </div>

              {error && <p className="form-error login-error">{error}</p>}

              <button type="submit" className="submit-button login-submit-button" disabled={submitting}>
                {submitting ? t.loading : t.submitButton}
              </button>
            </form>

        <p className="form-link-row login-form-links">
          <Link to="/waitlist" className="form-link">{t.joinWaitlistLink}</Link>
        </p>
      </motion.div>
    </AuthLayout>
  )
}
