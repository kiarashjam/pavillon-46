import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import PageLayout from '../components/PageLayout'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { sendVerification, verifyCode, submitWaitlist } from '../lib/api'
import { EASE_SOFT, EASE_SMOOTH_OUT, EASE_QUICK_OUT } from '../lib/motion'

interface CountryCode {
  code: string
  country: string
  flag: string
  name: string
}

const countryCodes: CountryCode[] = [
  { code: '+41', country: 'CH', flag: '🇨🇭', name: 'Switzerland' },
  { code: '+33', country: 'FR', flag: '🇫🇷', name: 'France' },
  { code: '+49', country: 'DE', flag: '🇩🇪', name: 'Germany' },
  { code: '+39', country: 'IT', flag: '🇮🇹', name: 'Italy' },
  { code: '+44', country: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: '+1', country: 'US', flag: '🇺🇸', name: 'United States' },
  { code: '+1', country: 'CA', flag: '🇨🇦', name: 'Canada' },
  { code: '+34', country: 'ES', flag: '🇪🇸', name: 'Spain' },
  { code: '+351', country: 'PT', flag: '🇵🇹', name: 'Portugal' },
  { code: '+32', country: 'BE', flag: '🇧🇪', name: 'Belgium' },
  { code: '+31', country: 'NL', flag: '🇳🇱', name: 'Netherlands' },
  { code: '+352', country: 'LU', flag: '🇱🇺', name: 'Luxembourg' },
  { code: '+377', country: 'MC', flag: '🇲🇨', name: 'Monaco' },
  { code: '+81', country: 'JP', flag: '🇯🇵', name: 'Japan' },
  { code: '+86', country: 'CN', flag: '🇨🇳', name: 'China' },
  { code: '+971', country: 'AE', flag: '🇦🇪', name: 'UAE' },
  { code: '+966', country: 'SA', flag: '🇸🇦', name: 'Saudi Arabia' },
  { code: '+974', country: 'QA', flag: '🇶🇦', name: 'Qatar' },
]

const HEAR_ABOUT_OPTION_KEYS: Array<'social' | 'friends' | 'press' | 'other'> = [
  'social', 'friends', 'press', 'other',
]
const HEAR_ABOUT_OTHER_MAX = 500

interface FormData {
  firstName: string
  lastName: string
  countryCode: string
  phoneNumber: string
  emailAddress: string
  postalCode: string
  hearAboutKey: string
  hearAboutOther: string
}

export default function Waitlist() {
  const navigate = useNavigate()
  const { language } = useLanguage()
  const t = useTranslations(language, 'waitlist')
  const tCommon = useTranslations(language, 'common')

  const [currentStep, setCurrentStep] = useState(1)
  const [direction, setDirection] = useState(1)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false)
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(countryCodes[0])
  const [hearAboutError, setHearAboutError] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [verificationCode, setVerificationCode] = useState('')
  const [verificationError, setVerificationError] = useState('')
  const [sendingCode, setSendingCode] = useState(false)
  const [verifyingCode, setVerifyingCode] = useState(false)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const cooldownRef = useRef<number | null>(null)

  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    countryCode: '+41',
    phoneNumber: '',
    emailAddress: '',
    postalCode: '',
    hearAboutKey: '',
    hearAboutOther: '',
  })

  useEffect(() => {
    document.title = t.title
  }, [t.title])

  useEffect(() => {
    const handleClickOutside = (event: PointerEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsCountryDropdownOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (cooldown > 0) {
      cooldownRef.current = window.setTimeout(() => setCooldown((c) => c - 1), 1000)
    }
    return () => {
      if (cooldownRef.current) window.clearTimeout(cooldownRef.current)
    }
  }, [cooldown])

  const handleCountrySelect = (country: CountryCode) => {
    setSelectedCountry(country)
    setFormData((prev) => ({ ...prev, countryCode: country.code }))
    setIsCountryDropdownOpen(false)
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const advance = (next: number) => {
    setDirection(1)
    setCurrentStep(next)
  }

  const goBack = () => {
    setVerificationError('')
    setVerificationCode('')
    setStatus('idle')
    setHearAboutError('')
    if (currentStep > 1) {
      setDirection(-1)
      setCurrentStep(currentStep - 1)
    }
  }

  const handleStep3Submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.hearAboutKey) {
      setHearAboutError(t.hearAboutValidationSelect)
      return
    }
    setHearAboutError('')
    advance(4)
  }

  const handleStep4Submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.phoneNumber) return
    setSendingCode(true)
    setVerificationError('')
    try {
      const res = await sendVerification(formData.countryCode, formData.phoneNumber)
      if (res.ok) {
        advance(5)
        setCooldown(60)
      } else {
        const data = await res.json().catch(() => ({}))
        setVerificationError(data?.detail || t.verifyError)
      }
    } catch {
      setVerificationError(t.serverError)
    } finally {
      setSendingCode(false)
    }
  }

  const handleResendCode = async () => {
    setSendingCode(true)
    setVerificationError('')
    setVerificationCode('')
    try {
      const res = await sendVerification(formData.countryCode, formData.phoneNumber)
      if (res.ok) {
        setCooldown(60)
      } else {
        const data = await res.json().catch(() => ({}))
        setVerificationError(data?.detail || t.verifyError)
      }
    } catch {
      setVerificationError(t.serverError)
    } finally {
      setSendingCode(false)
    }
  }

  const submitWaitlistForm = async () => {
    setStatus('loading')
    setVerificationError('')
    try {
      const res = await submitWaitlist({ ...formData, language })
      if (res.ok) {
        setStatus('success')
        window.requestAnimationFrame(() => navigate('/thank-you'))
      } else {
        setStatus('error')
        setVerificationError(t.errorMessage)
      }
    } catch {
      setStatus('error')
      setVerificationError(t.serverError)
    }
  }

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (phoneVerified) {
      await submitWaitlistForm()
      return
    }
    if (!verificationCode || verificationCode.length < 4) return

    setVerifyingCode(true)
    setVerificationError('')

    try {
      const res = await verifyCode(formData.countryCode, formData.phoneNumber, verificationCode)
      let data: { verified?: boolean; errorType?: string } = {}
      try {
        data = await res.json()
      } catch {
        setVerificationError(t.serverError)
        setVerifyingCode(false)
        return
      }

      if (res.ok && data.verified) {
        setPhoneVerified(true)
        setVerifyingCode(false)
        await submitWaitlistForm()
      } else {
        if (data.errorType === 'expired' || data.errorType === 'max_attempts') {
          setVerificationError(t.codeExpired)
        } else {
          setVerificationError(t.invalidCode)
        }
        setVerificationCode('')
        setVerifyingCode(false)
      }
    } catch {
      setVerificationError(t.serverError)
      setVerifyingCode(false)
    }
  }

  const stepVariants = {
    enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 80 : -80, scale: 0.94 }),
    center: {
      opacity: 1,
      x: 0,
      scale: 1,
      transition: { duration: 0.5, ease: EASE_SMOOTH_OUT },
    },
    exit: (dir: number) => ({
      opacity: 0,
      x: dir > 0 ? -40 : 40,
      scale: 0.97,
      transition: { duration: 0.25, ease: EASE_QUICK_OUT },
    }),
  }

  const renderStepIndicator = () => {
    const steps = [t.stepName, t.stepEmail, t.stepSource, t.stepPhone, t.stepVerify]
    return (
      <div className="step-indicator" role="progressbar" aria-valuemin={1} aria-valuemax={5} aria-valuenow={currentStep}>
        {steps.map((label, i) => {
          const stepNumber = i + 1
          const isActive = stepNumber === currentStep
          const isDone = stepNumber < currentStep
          return (
            <div key={label} className={`step-dot${isActive ? ' active' : ''}${isDone ? ' done' : ''}`} aria-label={label}>
              <span className="step-dot-label">{label}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <PageLayout>
      <div className="waitlist-page">
        <div className="background-container">
          <div className="background-image" />
        </div>

        <div className="form-overlay">
          <motion.div
            className="form-container"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1, ease: EASE_SOFT }}
          >
            <h1 className="form-heading">{t.heading}</h1>
            {renderStepIndicator()}

            <AnimatePresence custom={direction} mode="wait">
              <motion.form
                key={currentStep}
                custom={direction}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                onSubmit={(e) => {
                  if (currentStep === 1) { e.preventDefault(); advance(2) }
                  else if (currentStep === 2) { e.preventDefault(); advance(3) }
                  else if (currentStep === 3) handleStep3Submit(e)
                  else if (currentStep === 4) handleStep4Submit(e)
                  else if (currentStep === 5) handleCodeSubmit(e)
                }}
                className="multi-step-form"
              >
                {currentStep === 1 && (
                  <>
                    <input
                      type="text" name="firstName" placeholder={t.firstNamePlaceholder}
                      value={formData.firstName} onChange={handleChange}
                      required className="form-input" autoFocus
                    />
                    <input
                      type="text" name="lastName" placeholder={t.lastNamePlaceholder}
                      value={formData.lastName} onChange={handleChange}
                      required className="form-input"
                    />
                  </>
                )}

                {currentStep === 2 && (
                  <>
                    <p className="step-description">{t.emailStepDescription}</p>
                    <input
                      type="email" name="emailAddress" placeholder={t.emailPlaceholder}
                      value={formData.emailAddress} onChange={handleChange}
                      required className="form-input" autoFocus
                    />
                    <input
                      type="text" name="postalCode" placeholder={t.postalCodePlaceholder}
                      value={formData.postalCode} onChange={handleChange}
                      required className="form-input"
                    />
                  </>
                )}

                {currentStep === 3 && (
                  <>
                    <p className="step-description">{t.hearAboutStepDescription}</p>
                    <label className="form-label" htmlFor="hearAboutKey">{t.hearAboutLabel}</label>
                    <select
                      id="hearAboutKey"
                      name="hearAboutKey"
                      value={formData.hearAboutKey}
                      onChange={handleChange}
                      className="form-input"
                    >
                      <option value="">{t.hearAboutPlaceholder}</option>
                      {HEAR_ABOUT_OPTION_KEYS.map((key) => (
                        <option key={key} value={key}>{t.hearAboutOptions[key]}</option>
                      ))}
                    </select>
                    {formData.hearAboutKey === 'other' && (
                      <textarea
                        name="hearAboutOther"
                        placeholder={t.hearAboutOtherPlaceholder}
                        value={formData.hearAboutOther}
                        onChange={handleChange}
                        maxLength={HEAR_ABOUT_OTHER_MAX}
                        className="form-input form-textarea"
                        rows={3}
                      />
                    )}
                    {hearAboutError && <p className="form-error">{hearAboutError}</p>}
                  </>
                )}

                {currentStep === 4 && (
                  <>
                    <p className="step-description">{t.phoneStepDescription}</p>
                    <div className="phone-row">
                      <div className="country-dropdown" ref={dropdownRef}>
                        <button
                          type="button"
                          className="country-selector"
                          onClick={() => setIsCountryDropdownOpen((open) => !open)}
                          aria-haspopup="listbox"
                          aria-expanded={isCountryDropdownOpen}
                        >
                          <span className="country-flag">{selectedCountry.flag}</span>
                          <span className="country-code">{selectedCountry.code}</span>
                        </button>
                        {isCountryDropdownOpen && (
                          <ul className="country-list" role="listbox">
                            {countryCodes.map((c) => (
                              <li
                                key={`${c.country}-${c.code}`}
                                role="option"
                                aria-selected={selectedCountry.country === c.country}
                                onClick={() => handleCountrySelect(c)}
                                className="country-list-item"
                              >
                                <span className="country-flag">{c.flag}</span>
                                <span className="country-code">{c.code}</span>
                                <span className="country-name">{c.name}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <input
                        type="tel"
                        name="phoneNumber"
                        placeholder={t.phonePlaceholder}
                        value={formData.phoneNumber}
                        onChange={handleChange}
                        required
                        className="form-input phone-input"
                        autoFocus
                      />
                    </div>
                    {verificationError && <p className="form-error">{verificationError}</p>}
                  </>
                )}

                {currentStep === 5 && (
                  <>
                    <p className="step-description">
                      {t.codeSentTo} {formData.countryCode} {formData.phoneNumber}
                    </p>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      name="code"
                      placeholder={t.codePlaceholder}
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                      required={!phoneVerified}
                      className="form-input verification-code-input"
                      autoFocus
                    />
                    {verificationError && <p className="form-error">{verificationError}</p>}
                    {phoneVerified && (
                      <p className="form-info">{t.phoneVerifiedRetry}</p>
                    )}
                    <div className="resend-row">
                      <button
                        type="button"
                        className="form-link"
                        onClick={handleResendCode}
                        disabled={cooldown > 0 || sendingCode}
                      >
                        {sendingCode
                          ? t.sendingCode
                          : cooldown > 0
                            ? `${t.resendIn} ${cooldown}s`
                            : t.resendCode}
                      </button>
                    </div>
                  </>
                )}

                <div className="form-actions">
                  {currentStep > 1 && (
                    <button type="button" className="back-button" onClick={goBack} disabled={status === 'loading' || verifyingCode || sendingCode}>
                      {t.backButton}
                    </button>
                  )}
                  <button
                    type="submit"
                    className="submit-button"
                    disabled={status === 'loading' || verifyingCode || sendingCode}
                  >
                    {currentStep < 5
                      ? (currentStep === 4 && sendingCode ? t.sendingCode : t.continueButton)
                      : (status === 'loading'
                          ? t.submitting
                          : phoneVerified
                            ? t.retrySubmit
                            : t.verifyCode)}
                  </button>
                </div>
              </motion.form>
            </AnimatePresence>

            <p className="form-link-row">
              <button className="form-link" onClick={() => navigate('/')}>{tCommon.goBack}</button>
            </p>
          </motion.div>
        </div>
      </div>
    </PageLayout>
  )
}
