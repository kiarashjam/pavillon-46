import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import AuthLayout from '../components/AuthLayout'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { useTranslations } from '../lib/translations'
import { animationVariants } from '../lib/constants'
import { changePassword } from '../lib/api'

export default function SetPassword() {
  const { language } = useLanguage()
  const { token, member, loading, applySession } = useAuth()
  const navigate = useNavigate()
  const t = useTranslations(language, 'dashboard')
  const tLogin = useTranslations(language, 'login')
  const tCommon = useTranslations(language, 'common')

  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = t.setPwTitle
  }, [t.setPwTitle])

  if (!loading && !token) return <Navigate to="/login" replace />
  // A member who has already set their password shouldn't see this screen.
  if (member && !member.mustChangePassword) return <Navigate to="/dashboard" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    if (pw.length < 8) {
      setError(t.setPwTooShort)
      return
    }
    if (pw !== confirm) {
      setError(t.setPwMismatch)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      // Adopt the re-issued session: the server bumped PasswordVersion, so the
      // token we authenticated this call with is already dead.
      const session = await changePassword(token, pw)
      applySession({ token: session.token, member: session.member })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadError)
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
        <span className="auth-form-eyebrow">{tCommon.byInvitation}</span>
            <h1 className="form-heading login-heading">{t.setPwTitle}</h1>
            <p className="form-subtitle login-subtitle">{t.setPwSubtitle}</p>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-field">
                <input
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder={t.newPassword}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  className="form-input login-input password-input"
                  aria-label={t.newPassword}
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-pressed={show}
                  aria-label={show ? tLogin.hidePassword : tLogin.showPassword}
                  onClick={() => setShow((s) => !s)}
                >
                  {show ? tLogin.hidePassword : tLogin.showPassword}
                </button>
              </div>

              <div className="login-field">
                <input
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder={t.confirmPassword}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="form-input login-input"
                  aria-label={t.confirmPassword}
                />
              </div>

              {error && <p className="form-error login-error">{error}</p>}

              <button type="submit" className="submit-button login-submit-button" disabled={submitting}>
                {submitting ? t.setPwSaving : t.setPwSubmit}
              </button>
            </form>
      </motion.div>
    </AuthLayout>
  )
}
