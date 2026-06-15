import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useTranslations } from '../../lib/translations'
import { animationVariants } from '../../lib/constants'
import { updateProfile } from '../../lib/api'

export default function Profile() {
  const { token, member, setMember } = useAuth()
  const { language, changeLanguage } = useLanguage()
  const t = useTranslations(language, 'dashboard')

  const [form, setForm] = useState({
    firstName: member?.firstName ?? '',
    lastName: member?.lastName ?? '',
    phone: member?.phone ?? '',
    city: member?.city ?? '',
    country: member?.country ?? '',
    preferredLanguage: (member?.preferredLanguage ?? language) as 'fr' | 'en',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!member) return null

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await updateProfile(token, form)
      setMember(updated)
      if (updated.preferredLanguage !== language) changeLanguage(updated.preferredLanguage)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2400)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadError)
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div variants={animationVariants.container} initial="hidden" animate="visible" className="dash-stack">
      <motion.header variants={animationVariants.item} className="dash-pagehead">
        <h1>{t.profileTitle}</h1>
        <p>{t.profileSubtitle}</p>
      </motion.header>

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
          <label className="dash-field dash-field-full">
            <span>{t.fldEmail}</span>
            <input value={member.email} className="dash-input" disabled readOnly />
            <small className="dash-field-hint">{t.emailReadonly}</small>
          </label>
          <label className="dash-field">
            <span>{t.fldPhone}</span>
            <input value={form.phone} onChange={update('phone')} className="dash-input" />
          </label>
          <label className="dash-field">
            <span>{t.fldCity}</span>
            <input value={form.city} onChange={update('city')} className="dash-input" />
          </label>
          <label className="dash-field">
            <span>{t.fldCountry}</span>
            <input value={form.country} onChange={update('country')} className="dash-input" />
          </label>
          <label className="dash-field">
            <span>{t.fldLanguage}</span>
            <select
              value={form.preferredLanguage}
              onChange={(e) => setForm((f) => ({ ...f, preferredLanguage: e.target.value as 'fr' | 'en' }))}
              className="dash-input"
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>

        {error && <p className="dash-error">{error}</p>}

        <div className="dash-form-actions">
          <button type="submit" className="dash-btn dash-btn-primary" disabled={saving}>
            {saving ? t.saving : t.save}
          </button>
          {saved && <span className="dash-saved-flash">{t.saved}</span>}
        </div>
      </motion.form>
    </motion.div>
  )
}
