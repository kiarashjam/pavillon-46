import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import AuthLayout from '../components/AuthLayout'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { animationVariants } from '../lib/constants'
import { forgotPassword, ApiError } from '../lib/api'

export default function ForgotPassword() {
  const { language } = useLanguage()
  const t = useTranslations(language, 'login')
  const tCommon = useTranslations(language, 'common')

  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = t.forgotTitle
  }, [t.forgotTitle])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting || submitted) return
    const trimmed = email.trim()
    // Client-side validation. Without this an empty submit races to the API,
    // gets a 400, and the neutral-success branch below silently flips to
    // "check your inbox" — a UX bug rather than a security one.
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError(t.forgotInvalidEmail)
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await forgotPassword(trimmed.toLowerCase())
      setSubmitted(true)
    } catch (err) {
      // Never reveal whether the email exists. Only surface a distinct error
      // for rate limits (which are safe to disclose); every other failure flips
      // to the neutral success state so a network hiccup can't be used to probe
      // for account existence.
      if (err instanceof ApiError && err.status === 429) {
        setError(t.forgotRateLimited)
      } else {
        setSubmitted(true)
      }
    } finally {
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
        <h1 className="form-heading login-heading">{t.forgotHeading}</h1>
        <p className="form-subtitle login-subtitle">{t.forgotSubtitle}</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder={t.forgotEmailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input login-input"
              aria-label={t.forgotEmailPlaceholder}
              disabled={submitting || submitted}
            />
          </div>

          {error && <p className="form-error login-error">{error}</p>}

          {submitted && (
            <p className="form-success login-success">{t.forgotSent}</p>
          )}

          <button
            type="submit"
            className="submit-button login-submit-button"
            disabled={submitting || submitted}
          >
            {submitting ? t.forgotSending : t.forgotSubmit}
          </button>
        </form>

        <p className="form-link-row login-form-links">
          <Link to="/login" className="form-link">{tCommon.backToLogin}</Link>
        </p>
      </motion.div>
    </AuthLayout>
  )
}
