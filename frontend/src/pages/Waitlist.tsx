import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, animate, motion, useIsPresent, useReducedMotion } from 'framer-motion'
import type { HTMLMotionProps, Variants } from 'framer-motion'
import PageLayout from '../components/PageLayout'
import Footer from '../components/Footer'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import type { WaitlistTranslations } from '../lib/translations'
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

// Longest dial code first, so a pasted "+352…" matches Luxembourg, not "+35".
const DIAL_CODES_LONGEST_FIRST = [...countryCodes].sort((a, b) => b.code.length - a.code.length)

type HearAboutKey = 'social' | 'friends' | 'press' | 'other'
const HEAR_ABOUT_OPTION_KEYS: HearAboutKey[] = ['social', 'friends', 'press', 'other']
const HEAR_ABOUT_OTHER_MAX = 500
const TOTAL_STEPS = 5
const RESEND_COOLDOWN_S = 60

interface FormData {
  firstName: string
  lastName: string
  countryCode: string
  phoneNumber: string
  emailAddress: string
  postalCode: string
  hearAboutKey: string
  hearAboutOther: string
  referralCode: string
}

type FieldName = 'firstName' | 'lastName' | 'emailAddress' | 'postalCode' | 'hearAboutKey' | 'phoneNumber' | 'code'

// Errors and messages are stored as translation keys, never as strings, so
// switching FR/EN re-renders whatever is on screen in the new language.
type WaitlistStringKey = {
  [K in keyof WaitlistTranslations]: WaitlistTranslations[K] extends string ? K : never
}[keyof WaitlistTranslations]

type FieldErrors = Partial<Record<FieldName, WaitlistStringKey>>

const STEP_FIELDS: Record<number, FieldName[]> = {
  1: ['firstName', 'lastName'],
  2: ['emailAddress', 'postalCode'],
  3: ['hearAboutKey'],
  4: ['phoneNumber'],
  5: ['code'],
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
// Lenient on purpose: it must accept 1095, 75008, SW1A 1AA, 1012 AB, K1A 0B1
// and, where there is no postcode, a city name such as "Ras Al Khaimah".
const POSTAL_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'’-]{1,39}$/u

interface NormalisedPhone {
  country: CountryCode
  /** National significant number, digits only — what the API joins to the dial code. */
  national: string
  /** The number as the visitor wrote it, minus the dial code and trunk 0. */
  display: string
}

/**
 * Turns whatever a visitor types or pastes into the national digits the
 * backend expects. The API builds the E.164 number by concatenating the dial
 * code and this value, so a Swiss "079 123 45 67" must arrive as "791234567":
 * sent as typed it became +410791234567, which Twilio rejects.
 * Returns null when the number can't be valid for the resulting country.
 */
function normalisePhone(raw: string, current: CountryCode): NormalisedPhone | null {
  let s = raw.trim().replace(/\(0\)/g, '')
  let country = current
  const intl = /^(\+|00)\s*/.exec(s)
  if (intl) {
    const rest = s.slice(intl[0].length)
    const digits = rest.replace(/\D/g, '')
    const match = DIAL_CODES_LONGEST_FIRST.find((c) => digits.startsWith(c.code.slice(1)))
    if (!match) return null
    // +1 is shared by the US and Canada: keep whichever is already selected.
    country = current.code === match.code ? current : match
    let need = match.code.length - 1
    let i = 0
    while (need > 0 && i < rest.length) {
      if (/\d/.test(rest[i])) need -= 1
      i += 1
    }
    s = rest.slice(i).replace(/^[\s\-.()]+/, '')
  }
  let national = s.replace(/\D/g, '')
  // Drop the trunk 0 everywhere except Italy, where it is part of the number.
  if (country.country !== 'IT' && national.startsWith('0')) {
    national = national.slice(1)
    s = s.replace(/^0[\s\-.]*/, '')
  }
  if (country.code === '+1' && national.length === 11 && national.startsWith('1')) {
    national = national.slice(1)
    s = s.replace(/^1[\s\-.]*/, '')
  }
  const valid = country.country === 'CH'
    ? national.length === 9
    : national.length >= 6 && national.length <= 14 && country.code.length - 1 + national.length <= 15
  if (!valid) return null
  let display = s.replace(/\s+/g, ' ').trim()
  if (display.replace(/\D/g, '') !== national) display = national
  return { country, national, display }
}

/**
 * One step. While AnimatePresence plays its exit, the panel is a disabled
 * fieldset: the controls can't take focus or keystrokes, so typing during a
 * transition always lands in the new step.
 */
const StepPanel = forwardRef<HTMLFieldSetElement, HTMLMotionProps<'fieldset'>>(function StepPanel(props, ref) {
  const isPresent = useIsPresent()
  return (
    <motion.fieldset
      ref={ref}
      {...props}
      className="wl-fieldset wl-panel"
      disabled={!isPresent}
      aria-hidden={isPresent ? undefined : true}
      style={{ ...props.style, pointerEvents: isPresent ? undefined : 'none' }}
    />
  )
})

const ErrorIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
    <path d="M8 4.8v3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="8" cy="10.9" r=".8" fill="currentColor" />
  </svg>
)

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const messageMotion = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE_SMOOTH_OUT } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: EASE_QUICK_OUT } },
}

export default function Waitlist() {
  const navigate = useNavigate()
  const { language } = useLanguage()
  const t = useTranslations(language, 'waitlist')
  const reduce = useReducedMotion() ?? false

  const [currentStep, setCurrentStep] = useState(1)
  const [direction, setDirection] = useState(1)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(countryCodes[0])
  // A member's share link (/waitlist?ref=CODE) pre-fills the referral code.
  const [refFromLink] = useState(() => new URLSearchParams(window.location.search).get('ref')?.trim() ?? '')
  const [formData, setFormData] = useState<FormData>(() => ({
    firstName: '',
    lastName: '',
    countryCode: countryCodes[0].code,
    phoneNumber: '',
    emailAddress: '',
    postalCode: '',
    hearAboutKey: '',
    hearAboutOther: '',
    referralCode: refFromLink,
  }))
  const [showReferral, setShowReferral] = useState(() => !!refFromLink)
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneDisplay, setPhoneDisplay] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [sendingCode, setSendingCode] = useState(false)
  const [verifyingCode, setVerifyingCode] = useState(false)
  // "+41|791234567" once that exact number is verified. Changing the number or
  // the country therefore invalidates the verification by itself.
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [attempted, setAttempted] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [asyncError, setAsyncError] = useState<WaitlistStringKey | null>(null)
  const [asyncInfo, setAsyncInfo] = useState<WaitlistStringKey | null>(null)
  const [statusKey, setStatusKey] = useState<WaitlistStringKey | null>(null)
  const [bodyHeight, setBodyHeight] = useState<number | 'auto'>('auto')

  const formRef = useRef<HTMLFormElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const codeInputRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  const lastSentToRef = useRef<string | null>(null)
  const verifyingRef = useRef(false)
  const lastTriedCodeRef = useRef('')
  const successTimerRef = useRef<number | undefined>(undefined)
  const aliveRef = useRef(true)
  const focusReferralOnMount = useRef(false)
  const prevCooldownRef = useRef(0)

  const phoneKey = `${formData.countryCode}|${formData.phoneNumber}`
  const phoneVerified = verifiedPhone === phoneKey
  const phoneVerifiedRef = useRef(phoneVerified)
  phoneVerifiedRef.current = phoneVerified
  const busy = sendingCode || verifyingCode || status === 'loading' || status === 'success'
  // Spinner and aria-busy only when the button's own label says it is working.
  const labelBusy = verifyingCode || status === 'loading' || (sendingCode && currentStep === 4)
  const verifiedAwaiting = currentStep === 5 && phoneVerified && (status === 'idle' || status === 'error')
  const stepCounter = t.stepCounter.replace('{current}', String(currentStep)).replace('{total}', String(TOTAL_STEPS))

  const regionNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([language], { type: 'region' })
    } catch {
      return null
    }
  }, [language])
  const countryName = (c: CountryCode) => regionNames?.of(c.country) ?? c.name

  useEffect(() => {
    document.title = `${stepCounter} – ${t.title}`
  }, [t.title, stepCounter])

  // StrictMode runs mount → cleanup → mount in development, so the flag is
  // set on every mount, not only in useRef's initial value.
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      window.clearTimeout(successTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => window.clearTimeout(id)
  }, [cooldown])

  // Tell screen-reader users when Resend becomes usable; the ticking countdown
  // itself is deliberately not announced.
  useEffect(() => {
    const prev = prevCooldownRef.current
    prevCooldownRef.current = cooldown
    if (prev > 0 && cooldown === 0 && currentStep === 5 && !phoneVerified) setStatusKey('resendAvailable')
  }, [cooldown, currentStep, phoneVerified])

  // Animate the card body between step heights instead of snapping.
  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(() => setBodyHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Move focus into the new step in the same commit that mounts it, so a
  // keystroke typed during the transition lands in the right field.
  useLayoutEffect(() => {
    if (currentStep === 5 && phoneVerifiedRef.current) {
      submitRef.current?.focus({ preventScroll: true })
      return
    }
    formRef.current
      ?.querySelector<HTMLElement>(`[data-step="${currentStep}"] [data-autofocus]`)
      ?.focus({ preventScroll: true })
  }, [currentStep])

  const focusById = (id: string, select = false) => {
    window.requestAnimationFrame(() => {
      const el = document.getElementById(id) as HTMLInputElement | null
      el?.focus({ preventScroll: true })
      if (select) el?.select?.()
    })
  }

  const clearFieldError = (field: FieldName) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  // ----- Validation ------------------------------------------------------

  const checkField = (field: FieldName, data: FormData = formData, phone = phoneInput, code = verificationCode): WaitlistStringKey | null => {
    switch (field) {
      case 'firstName':
        return data.firstName.trim() ? null : 'firstNameRequired'
      case 'lastName':
        return data.lastName.trim() ? null : 'lastNameRequired'
      case 'emailAddress': {
        const v = data.emailAddress.trim()
        if (!v) return 'emailRequired'
        return EMAIL_RE.test(v) ? null : 'emailInvalid'
      }
      case 'postalCode': {
        const v = data.postalCode.trim()
        if (!v) return 'postalCodeRequired'
        return POSTAL_RE.test(v) ? null : 'postalCodeInvalid'
      }
      case 'hearAboutKey':
        return (HEAR_ABOUT_OPTION_KEYS as string[]).includes(data.hearAboutKey) ? null : 'hearAboutValidationSelect'
      case 'phoneNumber':
        if (!phone.trim()) return 'phoneRequired'
        return normalisePhone(phone, selectedCountry) ? null : 'phoneInvalid'
      case 'code':
        if (phoneVerified) return null
        if (!code) return 'codeRequired'
        return code.length >= 4 ? null : 'codeIncomplete'
      default:
        return null
    }
  }

  const validateStep = (step: number): FieldErrors => {
    const errors: FieldErrors = {}
    for (const field of STEP_FIELDS[step]) {
      const err = checkField(field)
      if (err) errors[field] = err
    }
    return errors
  }

  const focusIdFor = (field: FieldName) => {
    if (field === 'hearAboutKey') return `wl-hearAbout-${formData.hearAboutKey || HEAR_ABOUT_OPTION_KEYS[0]}`
    if (field === 'code') return 'wl-code'
    return `wl-${field}`
  }

  // Reward early, punish late: no error before the first Continue; after it,
  // an error disappears as soon as the field is fixed, and is re-checked on blur.
  const revalidateOnBlur = (field: FieldName) => {
    if (!attempted) return
    const err = checkField(field)
    if (err) setFieldErrors((prev) => (prev[field] === err ? prev : { ...prev, [field]: err }))
    else clearFieldError(field)
  }

  // ----- Navigation ------------------------------------------------------

  const resetStepMessages = () => {
    setAttempted(false)
    setFieldErrors({})
    setAsyncError(null)
    setAsyncInfo(null)
    setStatusKey(null)
  }

  const advance = (next: number) => {
    setDirection(1)
    resetStepMessages()
    setCurrentStep(next)
  }

  const goBack = () => {
    if (busy || currentStep <= 1) return
    resetStepMessages()
    setVerificationCode('')
    if (status === 'error') setStatus('idle')
    setDirection(-1)
    setCurrentStep(currentStep - 1)
  }

  const onFormKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    const next = (e.target as HTMLElement).dataset.next
    if (next) {
      e.preventDefault()
      document.getElementById(next)?.focus()
    }
  }

  // ----- Field handlers --------------------------------------------------

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    const next = { ...formData, [name]: value }
    setFormData(next)
    const field = name as FieldName
    if (fieldErrors[field] && !checkField(field, next)) clearFieldError(field)
  }

  const onPhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setPhoneInput(value)
    if (asyncError) setAsyncError(null)
    if (fieldErrors.phoneNumber && !checkField('phoneNumber', formData, value)) clearFieldError('phoneNumber')
  }

  // A pasted or autofilled international number picks its own country.
  const onPhoneBlur = () => {
    const raw = phoneInput.trim()
    if (/^(\+|00)/.test(raw)) {
      const n = normalisePhone(raw, selectedCountry)
      if (n) {
        setSelectedCountry(n.country)
        setFormData((prev) => ({ ...prev, countryCode: n.country.code }))
        setPhoneInput(n.display)
        clearFieldError('phoneNumber')
        return
      }
    }
    revalidateOnBlur('phoneNumber')
  }

  const onCountryChange = (e: ChangeEvent<HTMLSelectElement>) => {
    if (sendingCode) return
    const c = countryCodes.find((x) => x.country === e.target.value)
    if (!c) return
    setSelectedCountry(c)
    setFormData((prev) => ({ ...prev, countryCode: c.code }))
    setAsyncError(null)
    if (fieldErrors.phoneNumber && normalisePhone(phoneInput, c)) clearFieldError('phoneNumber')
  }

  const onCodeChange = (e: ChangeEvent<HTMLInputElement>) => {
    // Autofill can insert "123 456": strip before limiting, never maxLength.
    const next = e.target.value.replace(/\D/g, '').slice(0, 6)
    setVerificationCode(next)
    if (asyncError) setAsyncError(null)
    if (fieldErrors.code && next.length >= 4) clearFieldError('code')
    if (next.length === 6 && next !== lastTriedCodeRef.current && !busy) void verify(next)
  }

  const openReferral = () => {
    focusReferralOnMount.current = true
    setShowReferral(true)
  }

  // ----- Server calls ----------------------------------------------------

  const sendCode = async () => {
    const n = normalisePhone(phoneInput, selectedCountry)
    if (!n) return
    setSelectedCountry(n.country)
    setFormData((p) => ({ ...p, countryCode: n.country.code, phoneNumber: n.national }))
    setPhoneDisplay(`${n.country.code} ${n.display}`)
    const key = `${n.country.code}|${n.national}`
    // Verified earlier and only the submission failed: no second SMS.
    if (verifiedPhone === key) { advance(5); return }
    // Same number, still inside the cooldown: reuse the code already sent.
    if (lastSentToRef.current === key && cooldown > 0) { advance(5); return }
    setSendingCode(true)
    setAsyncError(null)
    setStatusKey('sendingCode')
    try {
      const res = await sendVerification(n.country.code, n.national)
      if (res.ok) {
        lastSentToRef.current = key
        setVerificationCode('')
        lastTriedCodeRef.current = ''
        setCooldown(RESEND_COOLDOWN_S)
        advance(5)
      } else {
        // Never show the server's own wording: it can be a raw exception.
        setAsyncError(res.status === 429 ? 'rateLimited' : 'verifyError')
        focusById('wl-phoneNumber')
      }
    } catch {
      setAsyncError('serverError')
      focusById('wl-phoneNumber')
    } finally {
      setSendingCode(false)
      setStatusKey((k) => (k === 'sendingCode' ? null : k))
    }
  }

  const handleResendCode = async () => {
    if (cooldown > 0 || busy) return
    setSendingCode(true)
    setAsyncError(null)
    setAsyncInfo(null)
    try {
      const res = await sendVerification(formData.countryCode, formData.phoneNumber)
      if (res.ok) {
        lastSentToRef.current = phoneKey
        setCooldown(RESEND_COOLDOWN_S)
        setVerificationCode('')
        lastTriedCodeRef.current = ''
        setAsyncInfo('codeResent')
        setStatusKey('codeResent')
        focusById('wl-code')
      } else {
        setAsyncError(res.status === 429 ? 'rateLimited' : 'verifyError')
      }
    } catch {
      setAsyncError('serverError')
    } finally {
      setSendingCode(false)
    }
  }

  const submitWaitlistForm = async () => {
    setStatus('loading')
    setAsyncError(null)
    setStatusKey('submitting')
    try {
      const res = await submitWaitlist({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        countryCode: formData.countryCode,
        phoneNumber: formData.phoneNumber,
        emailAddress: formData.emailAddress.trim(),
        postalCode: formData.postalCode.trim(),
        hearAboutKey: formData.hearAboutKey,
        hearAboutOther: formData.hearAboutKey === 'other' ? formData.hearAboutOther.trim() : '',
        referralCode: formData.referralCode.trim().toUpperCase(),
        language,
      })
      if (res.ok) {
        setStatus('success')
        setStatusKey('submitSuccess')
        // A short beat on "Request sent" before the thank-you page.
        successTimerRef.current = window.setTimeout(async () => {
          if (cardRef.current) {
            await animate(cardRef.current, { opacity: 0, y: reduce ? 0 : -8 }, { duration: 0.2, ease: EASE_QUICK_OUT })
          }
          if (aliveRef.current) navigate('/thank-you')
        }, reduce ? 300 : 600)
      } else {
        setStatus('error')
        setAsyncError('errorMessage')
        focusById('wl-submit')
      }
    } catch {
      setStatus('error')
      setAsyncError('serverError')
      focusById('wl-submit')
    }
  }

  const verify = async (code: string) => {
    if (verifyingRef.current || busy) return
    verifyingRef.current = true
    lastTriedCodeRef.current = code
    setVerifyingCode(true)
    setAsyncError(null)
    setAsyncInfo(null)
    setStatusKey('verifying')
    try {
      const res = await verifyCode(formData.countryCode, formData.phoneNumber, code)
      const data: { verified?: boolean; errorType?: string } = await res.json().catch(() => ({}))
      if (res.ok && data.verified) {
        verifyingRef.current = false
        setVerifiedPhone(phoneKey)
        setVerifyingCode(false)
        void submitWaitlistForm()
        return
      }
      if (data.errorType === 'expired' || data.errorType === 'max_attempts') {
        setAsyncError(data.errorType === 'expired' ? 'codeExpired' : 'codeTooManyAttempts')
        setVerificationCode('')
        lastTriedCodeRef.current = ''
        setCooldown(0)
        focusById('wl-code')
      } else if (data.errorType === 'rate_limit' || res.status === 429) {
        setAsyncError('rateLimited')
      } else if (data.errorType === 'invalid_code') {
        // Keep the code and select it: a one-digit typo stays visible, and the
        // next keystroke or autofill replaces the whole thing.
        setAsyncError('invalidCode')
        if (!reduce && codeInputRef.current) {
          animate(codeInputRef.current, { x: [0, -6, 6, -4, 4, 0] }, { duration: 0.36, ease: 'easeOut' })
        }
        focusById('wl-code', true)
      } else {
        setAsyncError('verifyUnavailable')
      }
    } catch {
      setAsyncError('serverError')
    }
    verifyingRef.current = false
    setVerifyingCode(false)
    setStatusKey(null)
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const errors = validateStep(currentStep)
    const invalid = STEP_FIELDS[currentStep].filter((f) => errors[f])
    if (invalid.length) {
      setAttempted(true)
      setFieldErrors(errors)
      const el = document.getElementById(focusIdFor(invalid[0]))
      // Focus can't move to where it already is, so announce the error instead.
      if (el && document.activeElement === el) setStatusKey(errors[invalid[0]] ?? null)
      if (el) window.requestAnimationFrame(() => el.focus())
      return
    }
    if (currentStep < 4) advance(currentStep + 1)
    else if (currentStep === 4) void sendCode()
    else if (phoneVerified) void submitWaitlistForm()
    else void verify(verificationCode)
  }

  // ----- Rendering helpers -----------------------------------------------

  const describedBy = (...ids: Array<string | false | null | undefined>) => ids.filter(Boolean).join(' ') || undefined

  const fieldError = (field: FieldName) => (
    <AnimatePresence initial={false}>
      {fieldErrors[field] && (
        <motion.p key="error" id={`wl-${field}-error`} className="wl-field-error" {...messageMotion}>
          <ErrorIcon />
          <span>{t[fieldErrors[field] as WaitlistStringKey]}</span>
        </motion.p>
      )}
    </AnimatePresence>
  )

  const asyncRegion = (id: string) => (
    <div id={id} className="wl-live" role="alert" aria-atomic="true">
      <AnimatePresence initial={false}>
        {asyncError && (
          <motion.p key="async" className="form-error" {...messageMotion}>
            <ErrorIcon />
            <span>{t[asyncError]}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )

  const textField = (
    field: 'firstName' | 'lastName' | 'emailAddress' | 'postalCode',
    label: string,
    attrs: React.InputHTMLAttributes<HTMLInputElement> & { 'data-autofocus'?: string; 'data-next'?: string },
    hint?: { id: string; text: string },
  ) => (
    <div className="wl-field">
      <label className="wl-label" htmlFor={`wl-${field}`}>{label}</label>
      <input
        id={`wl-${field}`}
        name={field}
        className="form-input"
        value={formData[field]}
        onChange={handleChange}
        onBlur={() => revalidateOnBlur(field)}
        required
        aria-invalid={fieldErrors[field] ? true : undefined}
        aria-describedby={describedBy(hint?.id, fieldErrors[field] && `wl-${field}-error`)}
        {...attrs}
      />
      {hint && <p id={hint.id} className="wl-hint">{hint.text}</p>}
      {fieldError(field)}
    </div>
  )

  const legend = (prompt: React.ReactNode) => (
    <legend className="step-description">
      <span className="wl-sr-only">{stepCounter}. </span>
      {prompt}
    </legend>
  )

  const stepVariants: Variants = {
    enter: (dir: number) => ({ opacity: 0, x: reduce ? 0 : 20 * dir }),
    center: {
      opacity: 1,
      x: 0,
      transition: { duration: reduce ? 0.2 : 0.34, delay: 0.06, ease: EASE_SMOOTH_OUT },
    },
    exit: (dir: number) => ({
      opacity: 0,
      x: reduce ? 0 : -12 * dir,
      transition: { duration: reduce ? 0.12 : 0.16, ease: EASE_QUICK_OUT },
    }),
  }

  const steps = [t.stepName, t.stepEmail, t.stepSource, t.stepPhone, t.stepVerify]

  const renderStepper = () => (
    <>
      <ol className="wl-stepper" aria-label={t.progressLabel}>
        {steps.map((label, i) => {
          const n = i + 1
          const isDone = n < currentStep || status === 'success'
          const isActive = n === currentStep && status !== 'success'
          return (
            // Keyed by index so switching language doesn't replay the checks.
            <li key={i} className={`wl-step${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}`} aria-current={isActive ? 'step' : undefined}>
              <span className="wl-step-dot" aria-hidden="true">{isDone ? <CheckIcon /> : n}</span>
              <span className="wl-step-label">
                {label}
                {isDone && <span className="wl-sr-only">, {t.stepDone}</span>}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="wl-step-caption" aria-hidden="true">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={currentStep}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: EASE_SMOOTH_OUT }}
          >
            {stepCounter} · {steps[currentStep - 1]}
          </motion.span>
        </AnimatePresence>
      </p>
    </>
  )

  const ctaLabel =
    status === 'success' ? t.submitSuccess
      : status === 'loading' ? t.submitting
        : verifyingCode ? t.verifying
          : sendingCode && currentStep === 4 ? t.sendingCode
            : currentStep < 4 ? t.continueButton
              : currentStep === 4 ? t.sendCodeButton
                : phoneVerified ? t.retrySubmit
                  : t.verifyCode

  const [codeBefore, codeAfter] = t.codeSentTo.split('{phone}')

  // ----- Steps -----------------------------------------------------------

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <>
            {legend(t.nameStepDescription)}
            <div className="wl-panel-body">
              {textField('firstName', t.firstNameLabel, {
                type: 'text', autoComplete: 'given-name', autoCapitalize: 'words', autoCorrect: 'off',
                spellCheck: false, enterKeyHint: 'next', maxLength: 80, 'data-autofocus': '', 'data-next': 'wl-lastName',
              })}
              {textField('lastName', t.lastNameLabel, {
                type: 'text', autoComplete: 'family-name', autoCapitalize: 'words', autoCorrect: 'off',
                spellCheck: false, enterKeyHint: 'next', maxLength: 80,
              })}
            </div>
          </>
        )

      case 2: {
        const fromLink = !!refFromLink && formData.referralCode.trim().toUpperCase() === refFromLink.toUpperCase()
        return (
          <>
            {legend(t.emailStepDescription)}
            <div className="wl-panel-body">
              {textField('emailAddress', t.emailLabel, {
                type: 'email', autoComplete: 'email', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false,
                enterKeyHint: 'next', maxLength: 254, 'data-autofocus': '', 'data-next': 'wl-postalCode',
              })}
              {textField('postalCode', t.postalCodeLabel, {
                // type="text" without inputMode: UK, NL and CA postcodes contain letters.
                type: 'text', autoComplete: 'postal-code', autoCapitalize: 'words', autoCorrect: 'off',
                spellCheck: false, enterKeyHint: 'next', maxLength: 40,
                'data-next': showReferral ? 'wl-referralCode' : undefined,
              }, { id: 'wl-postalCode-hint', text: t.postalCodeHint })}
              <AnimatePresence initial={false} mode="popLayout">
                {showReferral ? (
                  <motion.div key="referral" className="wl-field" {...messageMotion}>
                    <label className="wl-label" htmlFor="wl-referralCode">
                      {t.referralCodeLabel} <span className="wl-label-optional">({t.optionalTag})</span>
                    </label>
                    <input
                      ref={(el) => {
                        if (el && focusReferralOnMount.current) {
                          focusReferralOnMount.current = false
                          el.focus({ preventScroll: true })
                        }
                      }}
                      id="wl-referralCode" name="referralCode" type="text" className="form-input"
                      value={formData.referralCode} onChange={handleChange}
                      autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                      enterKeyHint="next" maxLength={32}
                      aria-describedby={fromLink ? 'wl-referral-hint' : undefined}
                    />
                    {fromLink && <p id="wl-referral-hint" className="wl-hint">{t.referralFromLink}</p>}
                  </motion.div>
                ) : (
                  <motion.button
                    key="toggle" type="button" className="wl-link-button wl-referral-toggle"
                    onClick={openReferral} {...messageMotion}
                  >
                    {t.referralToggle}
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </>
        )
      }

      case 3: {
        const err = fieldErrors.hearAboutKey
        return (
          <>
            {legend(t.hearAboutLabel)}
            <div className="wl-panel-body">
              <div className="wl-choices">
                {HEAR_ABOUT_OPTION_KEYS.map((key) => {
                  const checked = formData.hearAboutKey === key
                  const focusTarget = (formData.hearAboutKey || HEAR_ABOUT_OPTION_KEYS[0]) === key
                  return (
                    <label key={key} className={`wl-choice${checked ? ' is-selected' : ''}`}>
                      <input
                        type="radio" className="wl-choice-input" id={`wl-hearAbout-${key}`}
                        name="hearAboutKey" value={key} checked={checked} onChange={handleChange} required
                        aria-invalid={err ? true : undefined}
                        aria-describedby={err ? 'wl-hearAboutKey-error' : undefined}
                        data-autofocus={focusTarget ? '' : undefined}
                      />
                      <span className="wl-choice-mark" aria-hidden="true" />
                      <span className="wl-choice-text">{t.hearAboutOptions[key]}</span>
                    </label>
                  )
                })}
              </div>
              <AnimatePresence initial={false}>
                {formData.hearAboutKey === 'other' && (
                  <motion.div key="other" className="wl-field" {...messageMotion}>
                    <label className="wl-label" htmlFor="wl-hearAboutOther">
                      {t.hearAboutOtherLabel} <span className="wl-label-optional">({t.optionalTag})</span>
                    </label>
                    {/* Not auto-focused: arrowing through the radios passes "Other",
                        and pulling focus out would break the arrow keys. */}
                    <input
                      id="wl-hearAboutOther" name="hearAboutOther" type="text" className="form-input"
                      value={formData.hearAboutOther} onChange={handleChange}
                      maxLength={HEAR_ABOUT_OTHER_MAX} autoComplete="off" enterKeyHint="next"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
              {fieldError('hearAboutKey')}
            </div>
          </>
        )
      }

      case 4: {
        const err = fieldErrors.phoneNumber
        return (
          <>
            {legend(t.phoneStepDescription)}
            <div className="wl-panel-body">
              <div className="wl-field">
                <label className="wl-label" htmlFor="wl-phoneNumber">{t.phoneLabel}</label>
                <div className="phone-row">
                  <div className="wl-country">
                    <span className="country-selector" aria-hidden="true">
                      <span className="country-flag">{selectedCountry.flag}</span>
                      <span className="country-code">{selectedCountry.code}</span>
                      <svg className="wl-chevron" viewBox="0 0 10 6" fill="none">
                        <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    {/* A native select laid over the chip: arrows, type-ahead and the
                        phone's own picker for free, and never clipped by the card. */}
                    <select
                      id="wl-country" className="wl-country-select" aria-label={t.countryCodeLabel}
                      value={selectedCountry.country} onChange={onCountryChange}
                      aria-disabled={sendingCode || undefined}
                    >
                      {countryCodes.map((c) => (
                        <option key={c.country} value={c.country}>{countryName(c)} ({c.code})</option>
                      ))}
                    </select>
                  </div>
                  <input
                    id="wl-phoneNumber" name="phoneNumber" type="tel" inputMode="tel" autoComplete="tel"
                    enterKeyHint="send" required data-autofocus="" className="form-input phone-input"
                    value={phoneInput} onChange={onPhoneChange} onBlur={onPhoneBlur} readOnly={sendingCode}
                    aria-invalid={err || asyncError ? true : undefined}
                    aria-describedby={describedBy(err && 'wl-phoneNumber-error', asyncError && 'wl-async-4')}
                  />
                </div>
                {fieldError('phoneNumber')}
              </div>
              {asyncRegion('wl-async-4')}
            </div>
          </>
        )
      }

      default: {
        const resendDisabled = cooldown > 0 || busy
        return (
          <>
            {legend(<>{codeBefore}<strong>{phoneDisplay}</strong>{codeAfter}</>)}
            <div className="wl-panel-body">
              {!verifiedAwaiting && (
                <div className="wl-field">
                  <label className="wl-label" htmlFor="wl-code">{t.codeLabel}</label>
                  <input
                    ref={codeInputRef} id="wl-code" name="code" type="text" inputMode="numeric" pattern="[0-9]*"
                    autoComplete="one-time-code" enterKeyHint="done" required data-autofocus=""
                    className="form-input verification-code-input"
                    value={verificationCode} onChange={onCodeChange}
                    readOnly={verifyingCode || status === 'loading' || status === 'success'}
                    aria-invalid={fieldErrors.code || asyncError === 'invalidCode' ? true : undefined}
                    aria-describedby={describedBy(fieldErrors.code && 'wl-code-error', asyncError && 'wl-async-5')}
                  />
                  {fieldError('code')}
                </div>
              )}
              {asyncRegion('wl-async-5')}
              <AnimatePresence initial={false}>
                {asyncInfo && !verifiedAwaiting && (
                  <motion.p key="info" className="form-info" {...messageMotion}>{t[asyncInfo]}</motion.p>
                )}
              </AnimatePresence>
              {verifiedAwaiting && <p id="wl-verified-info" className="form-info">{t.phoneVerifiedRetry}</p>}
              <div className="resend-row">
                {!verifiedAwaiting && (
                  <>
                    <button
                      type="button" className="wl-link-button" onClick={handleResendCode}
                      aria-disabled={resendDisabled || undefined}
                      aria-describedby={cooldown > 0 ? 'wl-resend-wait' : undefined}
                    >
                      {sendingCode ? t.sendingCode : t.resendCode}
                    </button>
                    {cooldown > 0 && (
                      <span id="wl-resend-wait" className="wl-resend-wait">
                        {t.resendIn.replace('{seconds}', String(cooldown))}
                      </span>
                    )}
                    <span className="wl-sep" aria-hidden="true">·</span>
                  </>
                )}
                <button type="button" className="wl-link-button" onClick={goBack} aria-disabled={busy || undefined}>
                  {t.changeNumber}
                </button>
              </div>
            </div>
          </>
        )
      }
    }
  }

  return (
    <PageLayout showFooter={false}>
      <div className="wl-shell">
        <main className="waitlist-page wl-page">
          <div className="background-container">
            <div className="background-image" />
          </div>

          <div className="form-overlay">
            <motion.div
              ref={cardRef}
              className="form-container waitlist-form-container"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE_SOFT }}
            >
              <h1 className="form-heading">{t.heading}</h1>
              {renderStepper()}

              <div className="wl-main">
                <form
                  ref={formRef}
                  className="multi-step-form"
                  noValidate
                  onSubmit={onSubmit}
                  onKeyDown={onFormKeyDown}
                >
                  {/* The body tweens between step heights; the action row below it
                      moves with the tween instead of jumping. */}
                  <motion.div
                    className="wl-body"
                    initial={false}
                    animate={{ height: bodyHeight }}
                    transition={{ duration: reduce ? 0 : 0.32, ease: EASE_SMOOTH_OUT }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="wl-body-measure" ref={measureRef}>
                      <div className="wl-step-viewport">
                        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                          <StepPanel
                            key={currentStep}
                            data-step={currentStep}
                            custom={direction}
                            variants={stepVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            aria-describedby={currentStep === 3 && fieldErrors.hearAboutKey ? 'wl-hearAboutKey-error' : undefined}
                          >
                            {renderStep()}
                          </StepPanel>
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>

                  <div className={`form-actions${currentStep > 1 ? ' has-back' : ''}`}>
                    {currentStep > 1 && (
                      <button type="button" className="back-button" onClick={goBack} aria-disabled={busy || undefined}>
                        <svg viewBox="0 0 12 12" aria-hidden="true" fill="none">
                          <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="wl-back-label">{t.backButton}</span>
                      </button>
                    )}
                    <button
                      ref={submitRef}
                      id="wl-submit"
                      type="submit"
                      className={`submit-button${status === 'success' ? ' is-success' : ''}`}
                      aria-disabled={busy || undefined}
                      aria-busy={labelBusy || undefined}
                      aria-describedby={verifiedAwaiting ? 'wl-verified-info' : undefined}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={ctaLabel}
                          className="wl-btn-label"
                          initial={{ opacity: 0, y: reduce ? 0 : 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: reduce ? 0 : -4 }}
                          transition={{ duration: 0.15, ease: EASE_SMOOTH_OUT }}
                        >
                          {labelBusy && <span className="wl-spinner" aria-hidden="true" />}
                          {status === 'success' && <CheckIcon className="wl-btn-check" />}
                          {ctaLabel}
                        </motion.span>
                      </AnimatePresence>
                    </button>
                  </div>
                </form>

                {/* Collapses in step with the body tween instead of fading out in place. */}
                <motion.div
                  className="wl-home"
                  initial={false}
                  animate={{ height: currentStep === 1 ? 'auto' : 0, opacity: currentStep === 1 ? 1 : 0 }}
                  transition={{ duration: reduce ? 0 : 0.32, ease: EASE_SMOOTH_OUT }}
                  style={{ overflow: 'hidden' }}
                  aria-hidden={currentStep === 1 ? undefined : true}
                >
                  <p className="form-link-row">
                    <Link to="/" className="form-link" tabIndex={currentStep === 1 ? undefined : -1}>
                      <span aria-hidden="true">← </span>
                      {t.backToHome}
                    </Link>
                  </p>
                </motion.div>
              </div>
            </motion.div>
          </div>

          <p className="wl-sr-only" role="status" aria-live="polite" aria-atomic="true">
            {statusKey ? t[statusKey] : ''}
          </p>
        </main>
        <Footer />
      </div>
    </PageLayout>
  )
}
