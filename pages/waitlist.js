import React, { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import PageLayout from '../components/layouts/PageLayout'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { animationVariants } from '../lib/constants'
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

export default function Waitlist() {
  const router = useRouter()
  const { language } = useLanguage()
  const t = useTranslations(language, 'waitlist')
  const tCommon = useTranslations(language, 'common')
  
  // Step: 1 = name, 2 = email/postal, 3 = phone, 4 = code verification
  const [currentStep, setCurrentStep] = useState(1)
  const [status, setStatus] = useState('idle')
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false)
  const [selectedCountry, setSelectedCountry] = useState(countryCodes[0])
  const dropdownRef = useRef(null)
  
  // Verification state
  const [verificationCode, setVerificationCode] = useState('')
  const [verificationError, setVerificationError] = useState('')
  const [sendingCode, setSendingCode] = useState(false)
  const [verifyingCode, setVerifyingCode] = useState(false)
  const [phoneVerified, setPhoneVerified] = useState(false) // track if code was already verified
  const [cooldown, setCooldown] = useState(0)
  const cooldownRef = useRef(null)
  
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    countryCode: '+41',
    phoneNumber: '',
    emailAddress: '',
    postalCode: '',
  })

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsCountryDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
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
    setFormData({ ...formData, countryCode: country.code })
    setIsCountryDropdownOpen(false)
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  // Step 1 → Step 2: validate name fields then go to email/postal step
  const handleStep1Submit = (e) => {
    e.preventDefault()
    setDirection(1)
    setCurrentStep(2)
  }

  // Step 2 → Step 3: validate email/postal then go to phone step
  const handleStep2Submit = (e) => {
    e.preventDefault()
    setDirection(1)
    setCurrentStep(3)
  }

  // Step 3 → Step 4: submit phone, send SMS code, show code input
  const handleStep3Submit = async (e) => {
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
        setCurrentStep(4)
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
        router.push('/thank-you')
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
                  { step: 3, label: t.stepPhone },
                  { step: 4, label: t.stepVerify },
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
                        href="#" 
                        className="form-link" 
                        onClick={(e) => e.preventDefault()}
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

                {/* ====== STEP 3: Phone Number ====== */}
                {currentStep === 3 && (
                  <motion.form 
                    key="step3"
                    className="waitlist-form" 
                    onSubmit={handleStep3Submit}
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
                {currentStep === 4 && (
                  <motion.form 
                    key="step4"
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
