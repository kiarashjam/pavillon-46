import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import PageLayout from '../components/PageLayout'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { animationVariants } from '../lib/constants'

export default function Login() {
  const { language } = useLanguage()
  const t = useTranslations(language, 'login')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)

  useEffect(() => {
    document.title = t.title
  }, [t.title])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!account.trim() || !password) {
      setMessage({ kind: 'error', text: t.validationError })
      return
    }
    setSubmitting(true)
    window.setTimeout(() => {
      setSubmitting(false)
      setMessage({ kind: 'info', text: t.successMessage })
    }, 800)
  }

  return (
    <PageLayout>
      <div className="waitlist-page">
        <div className="background-container">
          <div className="background-image" />
        </div>

        <div className="form-overlay">
          <motion.div
            className="form-container login-form"
            variants={animationVariants.form}
            initial="hidden"
            animate="visible"
          >
            <h1 className="form-heading">{t.heading}</h1>
            <p className="form-subtitle">{t.subtitle}</p>

            <form onSubmit={handleSubmit} className="login-form-fields">
              <input
                type="text"
                placeholder={t.accountPlaceholder}
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="form-input"
                aria-label={t.accountPlaceholder}
              />

              <div className="password-row">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t.passwordPlaceholder}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-input"
                  aria-label={t.passwordPlaceholder}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? t.hidePassword : t.showPassword}
                </button>
              </div>

              {message && (
                <p className={message.kind === 'error' ? 'form-error' : 'form-info'}>{message.text}</p>
              )}

              <button type="submit" className="submit-button" disabled={submitting}>
                {submitting ? t.loading : t.submitButton}
              </button>
            </form>

            <p className="form-link-row">
              <Link to="/waitlist" className="form-link">{t.joinWaitlistLink}</Link>
            </p>
          </motion.div>
        </div>
      </div>
    </PageLayout>
  )
}
