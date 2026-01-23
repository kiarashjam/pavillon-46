import Link from 'next/link'
import Head from 'next/head'
import Image from 'next/image'
import Header from '../components/Header'
import { useLanguage } from '../contexts/LanguageContext'
import { motion } from 'framer-motion'

export default function Home() {
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
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
  }

  const logoVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.8,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
  }

  const translations = {
    fr: {
      title: 'Pavillon 46',
      description: 'Bienvenue à Pavillon 46 - La vie en couleurs',
      openingDate: 'Ouverture été 2027',
      welcomeText: 'Bienvenue à',
      sloganPart1: 'La vie en',
      sloganPart2: 'couleurs',
      joinButton: 'Rejoindre la liste d\'attente',
      footerText: 'Accès sur invitation, avec un nombre limité de membres',
      legal: 'Mentions légales',
    },
    en: {
      title: 'Pavillon 46',
      description: 'Welcome to Pavillon 46 - Life in Full Color',
      openingDate: 'Opening Summer 2027',
      welcomeText: 'Welcome to',
      sloganPart1: 'Life in',
      sloganPart2: 'Full Color',
      joinButton: 'Join the Waitlist',
      footerText: 'Access by invitation, with limited membership',
      legal: 'Legal',
    },
  }

  const t = translations[language]

  return (
    <>
      <Head>
        <title>{t.title}</title>
        <meta name="description" content={t.description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="container">
        <Header />
        {/* Full-page: image 6 background */}
        <div className="page-bg" aria-hidden="true" />
        {/* Full-page: blur + dark overlay (makes background not clear) */}
        <div className="page-overlay" aria-hidden="true" />

        {/* Left Section: image 4 + legal */}
        <div className="left-section">
          <div className="left-image" aria-hidden="true" />
          <div className="legal-wrap">
            <div className="legal-line" />
            <div className="legal-text">{t.legal}</div>
          </div>
        </div>

        {/* Right Section: content */}
        <div className="right-section">
          <motion.div 
            className="right-content"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div className="opening-date" variants={itemVariants}>
              {t.openingDate}
            </motion.div>
            <motion.div className="welcome-text" variants={itemVariants}>
              {t.welcomeText}
            </motion.div>
            <motion.div className="logo-container" variants={logoVariants}>
              <div className="logo-main">
                <Image 
                  src="/images/logo.png" 
                  alt="PAVILLON 46" 
                  width={400} 
                  height={160}
                  className="logo-image"
                  priority
                />
              </div>
            </motion.div>
            <motion.div className="slogan" variants={itemVariants}>
              <span className="slogan-part1">{t.sloganPart1}</span>
              <span className="slogan-part2">{t.sloganPart2}</span>
            </motion.div>
            <motion.div variants={itemVariants}>
              <Link href="/waitlist" className="join-button">
                <span className="button-text">{t.joinButton}</span>
              </Link>
            </motion.div>
            <motion.p className="footer-text" variants={itemVariants}>
              {t.footerText}
            </motion.p>
          </motion.div>
        </div>
      </div>
    </>
  )
}
