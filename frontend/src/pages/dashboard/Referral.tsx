import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useTranslations } from '../../lib/translations'
import { animationVariants } from '../../lib/constants'
import { EASE_BOUNCE } from '../../lib/motion'
import { submitReferral } from '../../lib/api'

const emptyForm = { firstName: '', lastName: '', email: '', phone: '' }

export default function Referral() {
  const { token } = useAuth()
  const { language } = useLanguage()
  const t = useTranslations(language, 'dashboard')
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [referredName, setReferredName] = useState<string | null>(null)

  const update = (key: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError(t.errRequiredName)
      return
    }
    if (!form.email.trim() && !form.phone.trim()) {
      setError(t.errRequiredContact)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await submitReferral(token, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        language,
      })
      setReferredName(`${form.firstName.trim()} ${form.lastName.trim()}`.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadError)
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setForm(emptyForm)
    setReferredName(null)
    setError(null)
  }

  if (referredName) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: EASE_BOUNCE }}
        className="dash-stack"
      >
        <div className="dash-success-card">
          <div className="dash-success-check" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1>{t.referSuccessTitle}</h1>
          <p>{t.referSuccessBody.replace('{name}', referredName)}</p>
          <p className="dash-reward-note">{t.rewardShort}</p>
          <button type="button" className="dash-btn dash-btn-primary" onClick={reset}>
            {t.referAnother}
          </button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div variants={animationVariants.container} initial="hidden" animate="visible" className="dash-stack">
      <motion.header variants={animationVariants.item} className="dash-pagehead">
        <h1>{t.referralTitle}</h1>
        <p>{t.referralSubtitle}</p>
      </motion.header>

      <motion.div variants={animationVariants.item} className="dash-reward">
        <span className="dash-reward-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <rect x="3.5" y="8.5" width="17" height="12" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
            <path d="M3 12h18M12 8.5v12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <path d="M12 8.5C12 8.5 11 4.8 8.4 5.2 6.2 5.5 6.8 8.5 12 8.5Zm0 0c0 0 1-3.7 3.6-3.3 2.2.3 1.6 3.3-3.6 3.3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="dash-reward-copy">
          <h2>{t.rewardTitle}</h2>
          <p>{t.rewardText}</p>
        </div>
      </motion.div>

      <motion.form variants={animationVariants.item} className="dash-form" onSubmit={handleSubmit}>
        <div className="dash-form-grid">
          <label className="dash-field">
            <span>{t.fldFirstName}</span>
            <input value={form.firstName} onChange={update('firstName')} className="dash-input" />
          </label>
          <label className="dash-field">
            <span>{t.fldLastName}</span>
            <input value={form.lastName} onChange={update('lastName')} className="dash-input" />
          </label>
          <label className="dash-field">
            <span>{t.fldEmail}</span>
            <input type="email" value={form.email} onChange={update('email')} className="dash-input" />
          </label>
          <label className="dash-field">
            <span>{t.fldPhone}</span>
            <input value={form.phone} onChange={update('phone')} className="dash-input" />
          </label>
        </div>

        {error && <p className="dash-error">{error}</p>}

        <button type="submit" className="dash-btn dash-btn-primary dash-btn-block" disabled={submitting}>
          {submitting ? t.submitting : t.submit}
        </button>
      </motion.form>
    </motion.div>
  )
}
