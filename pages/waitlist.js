import React, { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import PageLayout from '../components/layouts/PageLayout'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { motion, AnimatePresence } from 'framer-motion'

// Country codes with flags
const countryCodes = [
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

const HEAR_ABOUT_OPTION_KEYS = ['social', 'friends', 'press', 'other']
const HEAR_ABOUT_OTHER_MAX = 500

export default function Waitlist() {
  const router = useRouter()
  const { language } = useLanguage()
  const t = useTranslations(language, 'waitlist')
  const tCommon = useTranslations(language, 'common')
  
  // Step: 1 = name, 2 = email/postal, 3 = hear-about, 4 = phone, 5 = code verification
  const [currentStep, setCurrentStep] = useState(1)
  const [status, setStatus] = useState('idle')
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false)
  const [selectedCountry, setSelectedCountry] = useState(countryCodes[0])
  const dropdownRef = useRef(null)
  const [hearAboutError, setHearAboutError] = useState('')
  
  // Verification state
  const [verificationCode, setVerificationCode] = useState('')
  const [verificationError, setVerificationError] = useState('')
  const [sendingCode, setSendingCode] = useState(false)
  const [verifyingCode, setVerifyingCode] = useState(false)
  const [phoneVerified, setPhoneVerified] = useState(false) // track if code was already verified
  const [cooldown, setCooldown] = useState(0)
  const cooldownRef = useRef(null)
  const thankYouNavRafRef = useRef(null)

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    countryCode: '+41',
    phoneNumber: '',
    emailAddress: '',
    postalCode: '',
    hearAboutKey: '',
    hearAboutOther: '',
  })

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsCountryDropdownOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [])

  useEffect(() => {
    return () => {
      if (thankYouNavRafRef.current != null) {
        cancelAnimationFrame(thankYouNavRafRef.current)
        thankYouNavRafRef.current = null
      }
    }
  }, [])

  // Cooldown timer for resend
  useEffect(() => {
    if (cooldown > 0) {
      cooldownRef.current = setTimeout(() => setCooldown(cooldown - 1), 1000)
    }
    return () => clearTimeout(cooldownRef.current)
  }, [cooldown])

  const handleCountrySelect = (country) => {
    setSelectedCountry(country)
    setFormData((prev) => ({ ...prev, countryCode: country.code }))
    setIsCountryDropdownOpen(false)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  // Step 1 → Step 2: validate name fields then go to email/postal step
  const handleStep1Submit = (e) => {
    e.preventDefault()
    setDirection(1)
    setCurrentStep(2)
  }

  // Step 2 → Step 3: validate email/postal, then go to hear-about step
  const handleStep2Submit = (e) => {
    e.preventDefault()
    setDirection(1)
    setCurrentStep(3)
  }

  // Step 3 → Step 4: validate hear-about selection, then go to phone step
  const handleStep3Submit = (e) => {
    e.preventDefault()
    if (!formData.hearAboutKey) {
      setHearAboutError(t.hearAboutValidationSelect)
      return
    }
    setHearAboutError('')
    setDirection(1)
    setCurrentStep(4)
  }

  // Step 4 → Step 5: submit phone, send SMS code, show code input
  const handleStep4Submit = async (e) => {
    e.preventDefault()
    if (!formData.phoneNumber) return

    setSendingCode(true)
    setVerificationError('')

    try {
      const res = await fetch('/api/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryCode: formData.countryCode,
          phoneNumber: formData.phoneNumber,
        }),
      })

      if (res.ok) {
        setDirection(1)
        setCurrentStep(5)
        setCooldown(60)
      } else {
        const data = await res.json()
        setVerificationError(data.detail || t.verifyError)
      }
    } catch (error) {
      console.error('Send verification error:', error)
      setVerificationError(t.serverError)
    } finally {
      setSendingCode(false)
    }
  }

  // Resend the code (from step 3)
  const handleResendCode = async () => {
    setSendingCode(true)
    setVerificationError('')
    setVerificationCode('')

    try {
      const res = await fetch('/api/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryCode: formData.countryCode,
          phoneNumber: formData.phoneNumber,
        }),
      })

      if (res.ok) {
        setCooldown(60)
      } else {
        const data = await res.json()
        setVerificationError(data.detail || t.verifyError)
      }
    } catch (error) {
      console.error('Resend code error:', error)
      setVerificationError(t.serverError)
    } finally {
      setSendingCode(false)
    }
  }

  // Submit the waitlist email (called after phone is verified)
  const submitWaitlistForm = async () => {
    setStatus('loading')
    setVerificationError('')

    try {
      const submitRes = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          language: language,
        }),
      })

      if (submitRes.ok) {
        setStatus('success')
        if (thankYouNavRafRef.current != null) {
          cancelAnimationFrame(thankYouNavRafRef.current)
        }
        thankYouNavRafRef.current = requestAnimationFrame(() => {
          thankYouNavRafRef.current = null
          router.push('/thank-you')
        })
      } else {
        setStatus('error')
        setVerificationError(t.errorMessage)
      }
    } catch (error) {
      console.error('Email submission error:', error)
      setStatus('error')
      setVerificationError(t.serverError)
    }
  }

  // Step 4: verify code → if correct, auto-submit the form
  const handleCodeSubmit = async (e) => {
    e.preventDefault()

    // If phone was already verified (retry after email failure), skip verification
    if (phoneVerified) {
      await submitWaitlistForm()
      return
    }

    if (!verificationCode || verificationCode.length < 4) return

    setVerifyingCode(true)
    setVerificationError('')

    try {
      const verifyRes = await fetch('/api/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryCode: formData.countryCode,
          phoneNumber: formData.phoneNumber,
          code: verificationCode,
        }),
      })

      let verifyData
      try {
        verifyData = await verifyRes.json()
      } catch {
        setVerificationError(t.serverError)
        setVerifyingCode(false)
        return
      }

      if (verifyRes.ok && verifyData.verified) {
        // Code is correct — mark phone as verified, then submit
        setPhoneVerified(true)
        setVerifyingCode(false)
        await submitWaitlistForm()
      } else {
        // Handle specific error types from API
        if (verifyData.errorType === 'expired' || verifyData.errorType === 'max_attempts') {
          setVerificationError(t.codeExpired)
          setVerificationCode('')
        } else {
          setVerificationError(t.invalidCode)
          setVerificationCode('')
        }
        setVerifyingCode(false)
      }
    } catch (error) {
      console.error('Verification error:', error)
      setVerificationError(t.serverError)
      setVerifyingCode(false)
    }
  }

  // Track direction for animations (1 = forward, -1 = backward)
  const [direction, setDirection] = useState(1)

  // Go back one step
  const handleBack = () => {
    setVerificationError('')
    setVerificationCode('')
    setStatus('idle')
    setHearAboutError('')
    if (currentStep > 1) {
      setDirection(-1)
      setCurrentStep(currentStep - 1)
    }
  }

  // ─── FANCY ANIMATION VARIANTS ───────────────────────────────

  // Form container — sweeping directional slide with scale
  const stepVariants = {
    enter: (dir) => ({
      opacity: 0,
      x: dir > 0 ? 80 : -80,
      scale: 0.94,
      rotateY: dir > 0 ? 3 : -3,
    }),
    center: {
      opacity: 1,
      x: 0,
      scale: 1,
      rotateY: 0,
      transition: {
        duration: 0.7,
        ease: [0.16, 1, 0.3, 1],
        staggerChildren: 0.12,
        delayChildren: 0.15,
      },
    },
    exit: (dir) => ({
      opacity: 0,
      x: dir > 0 ? -40 : 40,
      scale: 0.97,
      transition: {
        duration: 0.25,
        ease: [0.4, 0, 1, 1],
      },
    }),
  }

  // Input fields — rise from below with elastic spring
  const fieldVariants = {
    enter: { opacity: 0, y: 35, scale: 0.94, x: -8 },
    center: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      x: 0,
      transition: { 
        type: 'spring', 
        stiffness: 200, 
        damping: 22,
        mass: 0.8,
      },
    },
    exit: { 
      opacity: 0, 
      transition: { duration: 0.15 },
    },
  }

  // Description text — dramatic fade in with letter-spacing feel
  const descriptionVariants = {
    enter: { opacity: 0, y: -20, scale: 1.02 },
    center: { 
      opacity: 1, 
      y: 0,
      scale: 1,
      transition: { 
        duration: 0.8, 
        ease: [0.16, 1, 0.3, 1],
      },
    },
    exit: { 
      opacity: 0, 
      transition: { duration: 0.15 },
    },
  }

  // Buttons container — bouncy spring entrance from below
  const buttonVariants = {
    enter: { opacity: 0, y: 40, scale: 0.85 },
    center: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: { 
        type: 'spring', 
        stiffness: 180, 
        damping: 18,
        mass: 1,
        delay: 0.1,
      },
    },
    exit: { 
      opacity: 0, 
      transition: { duration: 0.15 },
    },
  }

  // Links — subtle float up
  const linkVariants = {
    enter: { opacity: 0, y: 15 },
    center: { 
      opacity: 1, 
      y: 0,
      transition: { 
        duration: 0.9, 
        ease: [0.16, 1, 0.3, 1],
        delay: 0.15,
      },
    },
    exit: { 
      opacity: 0, 
      transition: { duration: 0.12 },
    },
  }

  // Phone input — wider slide from the right
  const phoneFieldVariants = {
    enter: { opacity: 0, x: 40, y: 10, scale: 0.95 },
    center: { 
      opacity: 1, 
      x: 0, 
      y: 0, 
      scale: 1,
      transition: { 
        type: 'spring', 
        stiffness: 160, 
        damping: 20,
        mass: 0.9,
      },
    },
    exit: { 
      opacity: 0, 
      transition: { duration: 0.15 },
    },
  }

  // Verification code input — scale up from center
  const codeFieldVariants = {
    enter: { opacity: 0, scale: 0.8, y: 20 },
    center: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      transition: { 
        type: 'spring', 
        stiffness: 250, 
        damping: 20,
        mass: 0.7,
      },
    },
    exit: { 
      opacity: 0, 
      transition: { duration: 0.15 },
    },
  }

  // Resend / verification actions — gentle fade slide
  const actionVariants = {
    enter: { opacity: 0, y: 12, x: 0 },
    center: { 
      opacity: 1, 
      y: 0,
      x: 0,
      transition: { 
        duration: 0.7, 
        ease: [0.16, 1, 0.3, 1],
        delay: 0.08,
      },
    },
    exit: { 
      opacity: 0, 
      transition: { duration: 0.12 },
    },
  }

  const hearAboutDropdownListVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.045, delayChildren: 0.04 },
    },
  }

  const hearAboutDropdownItemVariants = {
    hidden: { opacity: 0, x: -16, scale: 0.96 },
    show: {
      opacity: 1,
      x: 0,
      scale: 1,
      transition: { type: 'spring', stiffness: 380, damping: 26 },
    },
  }

  return (
    <>
      <Head>
        <title>{t.title}</title>
        <meta name="description" content={t.description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <PageLayout>
        <div className="waitlist-page">
          {/* Background Image Container */}
          <div className="background-container">
            <div className="background-image"></div>
          </div>

          {/* Waitlist Form Overlay */}
          <div className="form-overlay">
            <motion.div 
              className="form-container"
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.h1 
                className="form-heading"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                {t.heading}
              </motion.h1>

              {/* Step indicator */}
              <div className="step-indicator">
                {[
                  { step: 1, label: t.stepName },
                  { step: 2, label: t.stepEmail },
                  { step: 3, label: t.stepSource },
                  { step: 4, label: t.stepPhone },
                  { step: 5, label: t.stepVerify },
                ].map(({ step, label }, idx) => (
                  <React.Fragment key={step}>
                    {idx > 0 && (
                      <div className="step-line-track">
                        <motion.div 
                          className="step-line-fill"
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: currentStep >= step ? 1 : 0 }}
                          transition={{ 
                            duration: 0.9, 
                            ease: [0.16, 1, 0.3, 1],
                            delay: currentStep >= step ? 0.15 : 0,
                          }}
                        />
                      </div>
                    )}
                    <div className="step-item">
                      <div 
                        className={`step-circle ${currentStep >= step ? 'active' : ''} ${currentStep > step ? 'completed' : ''}`}
                      >
                        {currentStep > step ? (
                          <motion.svg 
                            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.4, delay: 0.1 }}
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </motion.svg>
                        ) : (
                          <span>{step}</span>
                        )}
                      </div>
                      <span className={`step-label ${currentStep >= step ? 'active' : ''}`}>
                        {label}
                      </span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
              
              <AnimatePresence mode="wait" custom={direction}>
                {/* ====== STEP 1: First Name & Last Name ====== */}
                {currentStep === 1 && (
                  <motion.form 
                    key="step1"
                    className="waitlist-form" 
                    onSubmit={handleStep1Submit}
                    custom={direction}
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    <motion.div className="form-group" variants={fieldVariants}>
                      <input
                        type="text"
                        id="firstName"
                        name="firstName"
                        placeholder={t.firstNamePlaceholder}
                        className="form-input"
                        value={formData.firstName}
                        onChange={handleChange}
                        required
                      />
                    </motion.div>
                    
                    <motion.div className="form-group" variants={fieldVariants}>
                      <input
                        type="text"
                        id="lastName"
                        name="lastName"
                        placeholder={t.lastNamePlaceholder}
                        className="form-input"
                        value={formData.lastName}
                        onChange={handleChange}
                        required
                      />
                    </motion.div>
                    
                    <motion.button 
                      type="submit" 
                      className="submit-button"
                      variants={buttonVariants}
                      whileHover={{ scale: 1.05, y: -2, boxShadow: '0 8px 30px rgba(43, 85, 65, 0.3)' }}
                      whileTap={{ scale: 0.95, y: 0 }}
                    >
                      {t.continueButton}
                    </motion.button>
                    
                    <motion.div 
                      className="form-links"
                      variants={linkVariants}
                    >
                      <motion.a 
                        href="/login" 
                        className="form-link" 
                        onClick={(e) => {
                          e.preventDefault()
                          router.push('/login')
                        }}
                        whileHover={{ y: -1, opacity: 0.8 }}
                      >
                        {tCommon.alreadyMember}
                      </motion.a>
                    </motion.div>
                  </motion.form>
                )}

                {/* ====== STEP 2: Email & Postal Code ====== */}
                {currentStep === 2 && (
                  <motion.form 
                    key="step2"
                    className="waitlist-form" 
                    onSubmit={handleStep2Submit}
                    custom={direction}
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    <motion.p className="step-description" variants={descriptionVariants}>{t.emailStepDescription}</motion.p>

                    <motion.div className="form-group" variants={fieldVariants}>
                      <input
                        type="email"
                        id="emailAddress"
                        name="emailAddress"
                        placeholder={t.emailPlaceholder}
                        className="form-input"
                        value={formData.emailAddress}
                        onChange={handleChange}
                        required
                        autoFocus
                      />
                    </motion.div>
                    
                    <motion.div className="form-group" variants={fieldVariants}>
                      <input
                        type="text"
                        id="postalCode"
                        name="postalCode"
                        placeholder={t.postalCodePlaceholder}
                        className="form-input"
                        value={formData.postalCode}
                        onChange={handleChange}
                        required
                      />
                    </motion.div>
                    
                    <motion.div className="step-buttons" variants={buttonVariants}>
                      <motion.button 
                        type="button" 
                        className="back-button"
                        onClick={handleBack}
                        whileHover={{ x: -4, scale: 1.02 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {t.backButton}
                      </motion.button>
                      <motion.button 
                        type="submit" 
                        className="submit-button"
                        whileHover={{ scale: 1.05, y: -2, boxShadow: '0 8px 30px rgba(43, 85, 65, 0.3)' }}
                        whileTap={{ scale: 0.95, y: 0 }}
                      >
                        {t.continueButton}
                      </motion.button>
                    </motion.div>
                  </motion.form>
                )}

                {/* ====== STEP 3: How did you hear about us? ====== */}
                {currentStep === 3 && (
                  <motion.form
                    key="step3-source"
                    className="waitlist-form hear-about-step-form"
                    onSubmit={handleStep3Submit}
                    custom={direction}
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    <motion.p className="step-description" variants={descriptionVariants}>
                      {t.hearAboutStepDescription || t.hearAboutLabel}
                    </motion.p>

                    <motion.div
                      className={`hear-about-step-list ${hearAboutError ? 'has-error' : ''}`}
                      role="radiogroup"
                      aria-label={t.hearAboutLabel}
                      variants={hearAboutDropdownListVariants}
                      initial="hidden"
                      animate="show"
                    >
                      {HEAR_ABOUT_OPTION_KEYS.map((key) => {
                        const selected = formData.hearAboutKey === key
                        return (
                          <motion.button
                            key={key}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            className={`hear-about-step-option ${selected ? 'selected' : ''}`}
                            variants={hearAboutDropdownItemVariants}
                            whileHover={{ x: 2 }}
                            whileTap={{ scale: 0.985 }}
                            onClick={() => {
                              setFormData((prev) => ({
                                ...prev,
                                hearAboutKey: key,
                                hearAboutOther: key === 'other' ? prev.hearAboutOther : '',
                              }))
                              if (hearAboutError) setHearAboutError('')
                            }}
                          >
                            <span className="hear-about-step-radio" aria-hidden>
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </span>
                            <span className="hear-about-step-option-text">
                              {t.hearAboutOptions?.[key] ?? key}
                            </span>
                          </motion.button>
                        )
                      })}
                    </motion.div>

                    <AnimatePresence initial={false}>
                      {formData.hearAboutKey === 'other' ? (
                        <motion.div
                          key="hear-other-input"
                          className="hear-about-other-field"
                          initial={{ opacity: 0, y: -8, height: 0, filter: 'blur(4px)' }}
                          animate={{
                            opacity: 1,
                            y: 0,
                            height: 'auto',
                            filter: 'blur(0px)',
                            transition: {
                              type: 'spring',
                              stiffness: 280,
                              damping: 26,
                              mass: 0.9,
                              when: 'beforeChildren',
                              staggerChildren: 0.07,
                              delayChildren: 0.08,
                            },
                          }}
                          exit={{
                            opacity: 0,
                            y: -4,
                            height: 0,
                            filter: 'blur(3px)',
                            transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
                          }}
                        >
                          <motion.div
                            className="hear-about-other-pill"
                            variants={{
                              initial: { opacity: 0, scale: 0.98, y: 4 },
                              animate: {
                                opacity: 1,
                                scale: 1,
                                y: 0,
                                transition: { type: 'spring', stiffness: 320, damping: 24 },
                              },
                            }}
                            initial="initial"
                            animate="animate"
                          >
                            <motion.span
                              className="hear-about-other-icon"
                              aria-hidden
                              initial={{ opacity: 0, rotate: -20, scale: 0.6 }}
                              animate={{
                                opacity: 1,
                                rotate: 0,
                                scale: 1,
                                transition: { type: 'spring', stiffness: 360, damping: 18, delay: 0.1 },
                              }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                              </svg>
                            </motion.span>

                            <motion.input
                              type="text"
                              name="hearAboutOther"
                              className="hear-about-other-input"
                              placeholder={t.hearAboutOtherPlaceholder}
                              value={formData.hearAboutOther}
                              onChange={handleChange}
                              maxLength={HEAR_ABOUT_OTHER_MAX}
                              autoComplete="off"
                              aria-label={t.hearAboutOtherPlaceholder}
                              initial={{ opacity: 0, x: -6 }}
                              animate={{
                                opacity: 1,
                                x: 0,
                                transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.12 },
                              }}
                            />

                            <AnimatePresence initial={false}>
                              {formData.hearAboutOther ? (
                                <motion.span
                                  key="counter"
                                  className="hear-about-other-counter"
                                  aria-live="polite"
                                  initial={{ opacity: 0, x: 6 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, x: 6 }}
                                  transition={{ duration: 0.2 }}
                                >
                                  {formData.hearAboutOther.length}/{HEAR_ABOUT_OTHER_MAX}
                                </motion.span>
                              ) : null}
                            </AnimatePresence>

                            <span className="hear-about-other-underline" aria-hidden />
                          </motion.div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>

                    <AnimatePresence>
                      {hearAboutError ? (
                        <motion.p
                          key="hear-step-err"
                          className="hear-about-error"
                          role="alert"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -2 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                        >
                          {hearAboutError}
                        </motion.p>
                      ) : null}
                    </AnimatePresence>

                    <motion.div className="step-buttons" variants={buttonVariants}>
                      <motion.button
                        type="button"
                        className="back-button"
                        onClick={handleBack}
                        whileHover={{ x: -4, scale: 1.02 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {t.backButton}
                      </motion.button>
                      <motion.button
                        type="submit"
                        className="submit-button"
                        whileHover={{ scale: 1.05, y: -2, boxShadow: '0 8px 30px rgba(43, 85, 65, 0.3)' }}
                        whileTap={{ scale: 0.95, y: 0 }}
                      >
                        {t.continueButton}
                      </motion.button>
                    </motion.div>
                  </motion.form>
                )}

                {/* ====== STEP 4: Phone Number ====== */}
                {currentStep === 4 && (
                  <motion.form 
                    key="step4-phone"
                    className="waitlist-form" 
                    onSubmit={handleStep4Submit}
                    custom={direction}
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    <motion.p className="step-description" variants={descriptionVariants}>{t.phoneStepDescription}</motion.p>

                    <motion.div className="form-group" variants={phoneFieldVariants}>
                      <div className="phone-input-group" ref={dropdownRef}>
                        <button
                          type="button"
                          className={`country-code-selector ${isCountryDropdownOpen ? 'open' : ''}`}
                          onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                          aria-label={`Select country code, currently ${selectedCountry.name} ${selectedCountry.code}`}
                        >
                          <span className="country-flag" role="img" aria-label={selectedCountry.name}>{selectedCountry.flag}</span>
                          <span className="country-code">{selectedCountry.code}</span>
                          <span className="dropdown-arrow">▼</span>
                        </button>
                        
                        {isCountryDropdownOpen && (
                          <motion.div 
                            className="country-dropdown"
                            initial={{ opacity: 0, y: -12, scale: 0.92 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ 
                              type: 'spring', 
                              stiffness: 300, 
                              damping: 24,
                            }}
                          >
                            {countryCodes.map((country, index) => (
                              <button
                                key={`${country.country}-${index}`}
                                type="button"
                                className={`country-option ${selectedCountry.country === country.country && selectedCountry.code === country.code ? 'selected' : ''}`}
                                onClick={() => handleCountrySelect(country)}
                              >
                                <span className="country-flag">{country.flag}</span>
                                <span className="country-name">{country.name}</span>
                                <span className="country-code">{country.code}</span>
                              </button>
                            ))}
                          </motion.div>
                        )}
                        
                        <input
                          type="tel"
                          id="phoneNumber"
                          name="phoneNumber"
                          placeholder={t.phonePlaceholder}
                          className="form-input phone-input"
                          value={formData.phoneNumber}
                          onChange={handleChange}
                          required
                          autoFocus
                        />
                      </div>
                    </motion.div>

                    {verificationError && (
                      <motion.p
                        className="verification-error"
                        initial={{ opacity: 0, x: -10, scale: 0.97 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 22 }}
                      >
                        {verificationError}
                      </motion.p>
                    )}
                    
                    <motion.div className="step-buttons" variants={buttonVariants}>
                      <motion.button 
                        type="button" 
                        className="back-button"
                        onClick={handleBack}
                        whileHover={{ x: -4, scale: 1.02 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {t.backButton}
                      </motion.button>
                      <motion.button 
                        type="submit" 
                        className="submit-button"
                        disabled={sendingCode || !formData.phoneNumber}
                        whileHover={{ scale: 1.05, y: -2, boxShadow: '0 8px 30px rgba(43, 85, 65, 0.3)' }}
                        whileTap={{ scale: 0.95, y: 0 }}
                      >
                        {sendingCode ? t.sendingCode : t.submitButton}
                      </motion.button>
                    </motion.div>
                  </motion.form>
                )}

                {/* ====== STEP 4: Verification Code ====== */}
                {currentStep === 5 && (
                  <motion.form 
                    key="step5-verify"
                    className="waitlist-form" 
                    onSubmit={handleCodeSubmit}
                    custom={direction}
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    <motion.p className="step-description" variants={descriptionVariants}>
                      {phoneVerified 
                        ? t.phoneVerifiedRetry 
                        : <>{t.codeSentTo} <strong>{selectedCountry.code} {formData.phoneNumber}</strong></>
                      }
                    </motion.p>

                    {/* Only show code input if phone is NOT yet verified */}
                    {!phoneVerified && (
                      <motion.div className="form-group" variants={codeFieldVariants}>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          placeholder={t.codePlaceholder}
                          className="form-input verification-code-input"
                          value={verificationCode}
                          onChange={(e) => {
                            setVerificationCode(e.target.value.replace(/\D/g, ''))
                            setVerificationError('')
                          }}
                          autoFocus
                        />
                      </motion.div>
                    )}

                    {verificationError && (
                      <motion.p
                        className="verification-error"
                        initial={{ opacity: 0, x: -10, scale: 0.97 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 22 }}
                      >
                        {verificationError}
                      </motion.p>
                    )}

                    {/* Only show resend options if phone is NOT yet verified */}
                    {!phoneVerified && (
                      <motion.div className="verification-actions" variants={actionVariants}>
                        {cooldown > 0 ? (
                          <span className="resend-cooldown">{t.resendIn} {cooldown}s</span>
                        ) : (
                          <motion.button
                            type="button"
                            className="resend-code-btn"
                            onClick={handleResendCode}
                            disabled={sendingCode}
                            whileHover={{ scale: 1.04, y: -1 }}
                            whileTap={{ scale: 0.96 }}
                          >
                            {sendingCode ? t.sendingCode : t.resendCode}
                          </motion.button>
                        )}
                      </motion.div>
                    )}
                    
                    <motion.div className="step-buttons" variants={buttonVariants}>
                      {!phoneVerified && (
                        <motion.button 
                          type="button" 
                          className="back-button"
                          onClick={handleBack}
                          whileHover={{ x: -4, scale: 1.02 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          {t.backButton}
                        </motion.button>
                      )}
                      <motion.button 
                        type="submit" 
                        className="submit-button"
                        disabled={
                          verifyingCode || 
                          status === 'loading' || 
                          (!phoneVerified && (!verificationCode || verificationCode.length < 4))
                        }
                        whileHover={{ scale: 1.05, y: -2, boxShadow: '0 8px 30px rgba(43, 85, 65, 0.3)' }}
                        whileTap={{ scale: 0.95, y: 0 }}
                      >
                        {verifyingCode || status === 'loading' 
                          ? t.submitting 
                          : phoneVerified 
                            ? t.retrySubmit 
                            : t.verifyCode
                        }
                      </motion.button>
                    </motion.div>
                  </motion.form>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      </PageLayout>
    </>
  )
}
