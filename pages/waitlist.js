import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { useLanguage } from '../contexts/LanguageContext'
import { motion } from 'framer-motion'

export default function Waitlist() {
  const router = useRouter()
  const { language } = useLanguage()
  const [status, setStatus] = useState('idle')
  const [formData, setFormData] = useState({
    fullName: '',
    phoneNumber: '',
    emailAddress: '',
    postalCode: '',
  })

  const translations = {
    fr: {
      title: 'Rejoindre la liste d\'attente - Pavillon 46',
      description: 'Rejoignez la liste d\'attente pour Pavillon 46',
      heading: 'Quelque chose d\'exclusif arrive',
      fullNamePlaceholder: 'Votre nom complet',
      phonePlaceholder: 'Votre numéro de téléphone',
      emailPlaceholder: 'Votre adresse e-mail',
      postalCodePlaceholder: 'Votre code postal',
      submitButton: 'Rejoindre la liste d\'attente',
      submitting: 'Inscription en cours...',
      goBack: '← Retour',
      haveCode: 'J\'ai un code',
      alreadyMember: 'Déjà membre ?',
      errorMessage: 'Une erreur s\'est produite. Veuillez réessayer.',
      serverError: 'Erreur de connexion au serveur.',
    },
    en: {
      title: 'Join the Waitlist - Pavillon 46',
      description: 'Join the waitlist for Pavillon 46',
      heading: 'Something exclusive is coming',
      fullNamePlaceholder: 'Your Full Name',
      phonePlaceholder: 'Your Phone Number',
      emailPlaceholder: 'Your Email Address',
      postalCodePlaceholder: 'Your Postal Code',
      submitButton: 'Join the Waitlist',
      submitting: 'Joining...',
      goBack: '← Go Back',
      haveCode: 'I have a code',
      alreadyMember: 'Already a member?',
      errorMessage: 'Something went wrong. Please try again.',
      serverError: 'Error connecting to the server.',
    },
  }

  const t = translations[language]

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
  }

  const formVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.6,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
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
      console.error(error)
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

      <div className="waitlist-page">
        <Header />

        {/* Background Image Container */}
        <div className="background-container">
          <div className="background-image"></div>
        </div>

        {/* Waitlist Form Overlay */}
        <div className="form-overlay">
          <motion.div 
            className="form-container"
            variants={formVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={itemVariants}>
              <Link href="/" className="go-back-link">{t.goBack}</Link>
            </motion.div>
            
            <motion.h1 className="form-heading" variants={itemVariants}>
              {t.heading}
            </motion.h1>
            
            <motion.form 
              className="waitlist-form" 
              onSubmit={handleSubmit}
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.div className="form-group" variants={itemVariants}>
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
              
              <motion.div className="form-group" variants={itemVariants}>
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
              
              <motion.div className="form-group" variants={itemVariants}>
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
              
              <motion.div className="form-group" variants={itemVariants}>
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
                variants={itemVariants}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {status === 'loading' ? t.submitting : t.submitButton}
              </motion.button>
            </motion.form>
            
            <motion.div 
              className="form-links"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.a href="#" className="form-link" onClick={(e) => e.preventDefault()} variants={itemVariants}>
                {t.haveCode}
              </motion.a>
              <motion.a href="#" className="form-link" onClick={(e) => e.preventDefault()} variants={itemVariants}>
                {t.alreadyMember}
              </motion.a>
            </motion.div>
          </motion.div>
        </div>

        <Footer />
      </div>
    </>
  )
}
