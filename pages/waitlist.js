import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import PageLayout from '../components/layouts/PageLayout'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { animationVariants } from '../lib/constants'
import { motion } from 'framer-motion'

export default function Waitlist() {
  const router = useRouter()
  const { language } = useLanguage()
  const t = useTranslations(language, 'waitlist')
  const tCommon = useTranslations(language, 'common')
  
  const [status, setStatus] = useState('idle')
  const [formData, setFormData] = useState({
    fullName: '',
    phoneNumber: '',
    emailAddress: '',
    postalCode: '',
  })

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
              variants={animationVariants.form}
              initial="hidden"
              animate="visible"
            >
              <motion.h1 className="form-heading" variants={animationVariants.itemSmall}>
                {t.heading}
              </motion.h1>
              
              <motion.form 
                className="waitlist-form" 
                onSubmit={handleSubmit}
                variants={animationVariants.container}
                initial="hidden"
                animate="visible"
              >
                <motion.div className="form-group" variants={animationVariants.itemSmall}>
                  <input
                    type="text"
                    id="fullName"
                    name="fullName"
                    placeholder={t.fullNamePlaceholder}
                    className="form-input"
                    value={formData.fullName}
                    onChange={handleChange}
                    required
                  />
                </motion.div>
                
                <motion.div className="form-group" variants={animationVariants.itemSmall}>
                  <input
                    type="tel"
                    id="phoneNumber"
                    name="phoneNumber"
                    placeholder={t.phonePlaceholder}
                    className="form-input"
                    value={formData.phoneNumber}
                    onChange={handleChange}
                    required
                  />
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
