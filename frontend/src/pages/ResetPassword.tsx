import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import AuthLayout from '../components/AuthLayout'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { animationVariants } from '../lib/constants'
import { resetPassword, ApiError } from '../lib/api'

export default function ResetPassword() {
  const { language } = useLanguage()
  const t = useTranslations(language, 'dashboard')
  const tLogin = useTranslations(language, 'login')
  const tCommon = useTranslations(language, 'common')

  const [params] = useSearchParams()
  const token = (params.get('token') ?? '').trim()
  // A member's first password, from the CadenceE welcome email: the same flow
  // as a reset, with welcome copy. Read once, because the token (and with it
  // the query string) is stripped from the URL after a successful save.
  const [welcome] = useState(() => params.get('welcome') === '1')

  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invalidToken, setInvalidToken] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    document.title = welcome ? t.welcomePwPageTitle : t.resetPwPageTitle
  }, [welcome, t.welcomePwPageTitle, t.resetPwPageTitle])

  const copy = welcome
    ? { eyebrow: t.welcomePwEyebrow, title: t.welcomePwTitle, subtitle: t.welcomePwSubtitle, submit: t.welcomePwSubmit, success: t.welcomePwSuccess, invalid: t.welcomePwInvalidToken }
    : { eyebrow: t.resetPwEyebrow, title: t.resetPwTitle, subtitle: t.resetPwSubtitle, submit: t.resetPwSubmit, success: t.resetPwSuccess, invalid: t.resetPwInvalidToken }

  const missingToken = !token

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting || success) return
    if (!token) return
    // Client-side validation runs first so we never fire a network call for a
    // trivially bad payload.
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
      await resetPassword(token, pw)
      setSuccess(true)
      // Strip the (now-burned) token from the URL, history stack, and any
      // Referer header this page will emit. Uses replaceState so we don't
      // remount and lose the success view.
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/reset-password')
      }
    } catch (err) {
      if (err instanceof ApiError) {
        // Token-shaped failures collapse to a single copy with a "request a new
        // link" CTA. The backend distinguishes them via errorType, but we mask
        // the distinction from the user (no leakage of unknown vs expired vs
        // superseded vs used).
        const isTokenError =
          err.status === 401 ||
          err.errorType === 'invalid' ||
          err.errorType === 'expired' ||
          err.errorType === 'mismatch'
        if (isTokenError) {
          setInvalidToken(true)
        } else if (err.status === 429) {
          setError(t.resetPwRateLimited)
        } else if (err.errorType === 'weak_password') {
          setError(t.setPwTooShort)
        } else {
          setError(err.message || t.resetPwFailed)
        }
      } else {
        setError(t.resetPwFailed)
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Missing or server-rejected tokens both render the same terminal state:
  // no form, distinct copy, and a link back to /forgot-password.
  if (missingToken || invalidToken) {
    return (
      <AuthLayout>
        <motion.div
          className="login-form-container"
          variants={animationVariants.form}
          initial="hidden"
          animate="visible"
        >
          <span className="auth-form-eyebrow">{copy.eyebrow}</span>
          <h1 className="form-heading login-heading">{copy.title}</h1>
          <p className="form-error login-error">
            {missingToken ? t.resetPwMissingToken : copy.invalid}
          </p>
          <p className="form-link-row login-form-links">
            <Link to="/forgot-password" className="form-link">
              {tLogin.forgotPasswordLink}
            </Link>
          </p>
        </motion.div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <motion.div
        className="login-form-container"
        variants={animationVariants.form}
        initial="hidden"
        animate="visible"
      >
        <span className="auth-form-eyebrow">{copy.eyebrow}</span>
        <h1 className="form-heading login-heading">{copy.title}</h1>
        <p className="form-subtitle login-subtitle">{copy.subtitle}</p>

        {success ? (
          <>
            <p className="form-success login-success">{copy.success}</p>
            <p className="form-link-row login-form-links">
              <Link to="/login" className="form-link">{t.resetPwGoToLogin}</Link>
            </p>
          </>
        ) : (
          <>
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
                  disabled={submitting}
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
                  disabled={submitting}
                />
              </div>

              {error && <p className="form-error login-error">{error}</p>}

              <button
                type="submit"
                className="submit-button login-submit-button"
                disabled={submitting}
              >
                {submitting ? t.resetPwSaving : copy.submit}
              </button>
            </form>

            <p className="form-link-row login-form-links">
              <Link to="/login" className="form-link">{tCommon.backToLogin}</Link>
            </p>
          </>
        )}
      </motion.div>
    </AuthLayout>
  )
}
