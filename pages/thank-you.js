import Head from 'next/head'
import Image from 'next/image'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { useLanguage } from '../contexts/LanguageContext'
import { motion } from 'framer-motion'

export default function ThankYou() {
  const { language } = useLanguage()

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
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
        duration: 0.6,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
  }

  const checkmarkVariants = {
    hidden: { opacity: 0, scale: 0, rotate: -180 },
    visible: {
      opacity: 1,
      scale: 1,
      rotate: 0,
      transition: {
        duration: 0.8,
        ease: [0.34, 1.56, 0.64, 1],
      },
    },
  }

  const thankYouVariants = {
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

  const translations = {
    fr: {
      title: 'Merci - Pavillon 46',
      description: 'Merci pour votre demande',
      heading: 'Merci pour votre demande',
      message1: 'Vous recevrez un e-mail de confirmation.',
      message2: 'Nous vous contacterons sous peu.',
    },
    en: {
      title: 'Thank You - Pavillon 46',
      description: 'Thank you for your inquiry',
      heading: 'Thank you for your inquiry',
      message1: 'You\'ll receive a confirmation email.',
      message2: 'We will contact you shortly.',
    },
  }

  const t = translations[language]

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

        {/* Thank You Overlay */}
        <div className="form-overlay">
          <motion.div 
            className="thank-you-container"
            variants={thankYouVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.h1 className="thank-you-heading" variants={itemVariants}>
              {t.heading}
            </motion.h1>
            
            <motion.div 
              className="checkmark-icon"
              variants={checkmarkVariants}
            >
              <Image 
                src="/images/Frame%201000004712.svg" 
                alt="Success" 
                width={80} 
                height={80}
                className="checkmark-svg"
              />
            </motion.div>
            
            <motion.div 
              className="confirmation-messages"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.p className="confirmation-text" variants={itemVariants}>
                {t.message1}
              </motion.p>
              <motion.p className="confirmation-text" variants={itemVariants}>
                {t.message2}
              </motion.p>
            </motion.div>
          </motion.div>
        </div>

        <Footer />
      </div>
    </>
  )
}
