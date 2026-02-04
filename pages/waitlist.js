import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import PageLayout from '../components/layouts/PageLayout'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { animationVariants } from '../lib/constants'
import { motion } from 'framer-motion'

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
  
  const [status, setStatus] = useState('idle')
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false)
  const [selectedCountry, setSelectedCountry] = useState(countryCodes[0]) // Default to Switzerland
  const dropdownRef = useRef(null)
  
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('loading')

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          language: language, // Include language in the request
        }),
      })

      if (res.ok) {
        setStatus('success')
        router.push('/thank-you')
      } else {
        setStatus('error')
        alert(t.errorMessage)
      }
    } catch (error) {
      console.error('Waitlist submission error:', error)
      setStatus('error')
      alert(t.serverError)
    }
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
              
              <motion.form 
                className="waitlist-form" 
                onSubmit={handleSubmit}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                <motion.div className="form-group" variants={animationVariants.itemSmall}>
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
                
                <motion.div className="form-group" variants={animationVariants.itemSmall}>
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
                
                <motion.div className="form-group" variants={animationVariants.itemSmall}>
                  <div className="phone-input-group" ref={dropdownRef}>
                    <button
                      type="button"
                      className="country-code-selector"
                      onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                    >
                      <span className="country-flag">{selectedCountry.flag}</span>
                      <span className="country-code">{selectedCountry.code}</span>
                      <span className="dropdown-arrow">▼</span>
                    </button>
                    
                    {isCountryDropdownOpen && (
                      <div className="country-dropdown">
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
                      </div>
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
                    />
                  </div>
                </motion.div>
                
                <motion.div className="form-group" variants={animationVariants.itemSmall}>
                  <input
                    type="email"
                    id="emailAddress"
                    name="emailAddress"
                    placeholder={t.emailPlaceholder}
                    className="form-input"
                    value={formData.emailAddress}
                    onChange={handleChange}
                    required
                  />
                </motion.div>
                
                <motion.div className="form-group" variants={animationVariants.itemSmall}>
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
                
                <motion.button 
                  type="submit" 
                  className="submit-button" 
                  disabled={status === 'loading'}
                  variants={animationVariants.itemSmall}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {status === 'loading' ? t.submitting : t.submitButton}
                </motion.button>
                
                <motion.div 
                  className="form-links"
                  variants={animationVariants.container}
                  initial="hidden"
                  animate="visible"
                >
                  <motion.a href="#" className="form-link" onClick={(e) => e.preventDefault()} variants={animationVariants.itemSmall}>
                    {tCommon.alreadyMember}
                  </motion.a>
                </motion.div>
              </motion.form>
            </motion.div>
          </div>
        </div>
      </PageLayout>
    </>
  )
}
