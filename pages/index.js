import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Image from 'next/image'
import PageLayout from '../components/layouts/PageLayout'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { IMAGE_PATHS } from '../lib/constants'
import { motion } from 'framer-motion'

export default function Home() {
  const router = useRouter()
  const { language } = useLanguage()
  const t = useTranslations(language, 'home')
  const tCommon = useTranslations(language, 'common')
  
  const [isExiting, setIsExiting] = useState(false)
  const [isBgTransitioning, setIsBgTransitioning] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 767)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const navigateWithExit = (path) => {
    if (isExiting) return
    setIsExiting(true)

    if (isMobile) {
      // Mobile: fade content first (0.8s), then start background transition
      setTimeout(() => {
        setIsBgTransitioning(true)
      }, 800)
      // Navigate after both animations complete
      setTimeout(() => {
        router.push(path)
      }, 2200)
    } else {
      // Desktop: simultaneous animations
      setIsBgTransitioning(true)
      setTimeout(() => {
        router.push(path)
      }, 1800)
    }
  }

  const handleNavigate = (e) => {
    e.preventDefault()
    navigateWithExit('/waitlist')
  }

  const handleMemberNavigate = (e) => {
    e.preventDefault()
    navigateWithExit('/login')
  }

  return (
    <>
      <Head>
        <title>{t.title}</title>
        <meta name="description" content={t.description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <PageLayout showFooter={false}>
        <div className="invite-only-page">
          {/* Waitlist background image underneath - preloaded for smooth transition */}
          <motion.div 
            className="preload-bg-container"
            initial={{ opacity: 0 }}
            animate={isBgTransitioning ? { opacity: 1 } : { opacity: 0 }}
            transition={{ 
              duration: 1.2, 
              delay: 0,
              ease: [0.25, 0.46, 0.45, 0.94] 
            }}
            aria-hidden="true"
          >
            <div className="preload-bg-image" />
          </motion.div>

          {/* Vector.png on top */}
          <motion.div 
            className="vector-46-container"
            initial={{ opacity: 0 }}
            animate={isBgTransitioning 
              ? { opacity: 0 } 
              : { opacity: 1 }
            }
            transition={{ 
              duration: isBgTransitioning ? 1.2 : 1.2, 
              delay: 0,
              ease: [0.25, 0.46, 0.45, 0.94] 
            }}
            aria-hidden="true"
          >
            <img 
              src="/images/Vector.png" 
              alt="" 
              className="vector-46-image"
            />
          </motion.div>

          {/* Content Section - Right Side */}
          <motion.div 
            className="invite-content"
            initial={{ opacity: 1 }}
            animate={isExiting 
              ? { opacity: 0 } 
              : { opacity: 1 }
            }
            transition={{ 
              duration: isExiting ? (isMobile ? 0.7 : 1.0) : 0.3, 
              delay: isExiting ? (isMobile ? 0 : 0.4) : 0,
              ease: [0.25, 0.46, 0.45, 0.94] 
            }}
          >
            {/* Welcome text */}
            <motion.p 
              className="invite-welcome"
              initial={{ opacity: 1 }}
              animate={isExiting 
                ? { opacity: 0, y: isMobile ? 0 : -30, filter: isMobile ? 'blur(0px)' : 'blur(10px)' } 
                : { opacity: 1, y: 0, filter: 'blur(0px)' }
              }
              transition={{ 
                duration: isExiting ? (isMobile ? 0.5 : 0.6) : 0.5, 
                delay: 0,
                ease: [0.25, 0.46, 0.45, 0.94] 
              }}
            >
              {t.welcomeText}
            </motion.p>
            
            {/* Logo */}
            <motion.div 
              className="invite-logo"
              initial={{ opacity: 1 }}
              animate={isExiting 
                ? { opacity: 0, scale: isMobile ? 1 : 0.8, filter: isMobile ? 'blur(0px)' : 'blur(10px)' } 
                : { opacity: 1, scale: 1, filter: 'blur(0px)' }
              }
              transition={{ 
                duration: isExiting ? (isMobile ? 0.5 : 0.7) : 0.5, 
                delay: 0,
                ease: [0.25, 0.46, 0.45, 0.94] 
              }}
            >
              <Image 
                src={IMAGE_PATHS.logo}
                alt="PAVILLON 46" 
                width={340} 
                height={140}
                className="invite-logo-image"
                priority
              />
            </motion.div>
            
            {/* Tagline (static, no animation) */}
            <p className="invite-tagline">
              <span style={{ display: 'inline-block' }}>
                {t.sloganPart1}{' '}
              </span>
              <span
                className="tagline-highlight"
                style={{ display: 'inline-block', marginLeft: '6px', marginRight: '6px' }}
              >
                {t.sloganPart2}
              </span>
              <span style={{ display: 'inline-block' }}>
                {t.sloganPart3}
              </span>
            </p>
            
            {/* CTA Button */}
            <motion.div
              className="invite-cta"
              initial={{ opacity: 0, y: 20 }}
              animate={isExiting 
                ? { opacity: 0, y: isMobile ? 0 : 40, scale: isMobile ? 1 : 0.9 } 
                : { opacity: 1, y: 0, scale: 1 }
              }
              transition={{ 
                duration: isExiting ? (isMobile ? 0.5 : 0.5) : 0.8, 
                delay: isExiting ? 0 : 0.9,
                ease: [0.25, 0.46, 0.45, 0.94] 
              }}
            >
              <motion.button
                onClick={handleNavigate}
                className="invite-button"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                disabled={isExiting}
              >
                {t.joinButton}
              </motion.button>
              <motion.a
                href="/login"
                className="form-link invite-member-link"
                onClick={handleMemberNavigate}
                whileHover={{ y: -1, opacity: 0.85 }}
              >
                {tCommon.alreadyMember}
              </motion.a>
            </motion.div>
          </motion.div>

          {/* Footer */}
          <motion.footer 
            className="invite-footer"
            initial={{ opacity: 0 }}
            animate={isExiting ? { opacity: 0 } : { opacity: 1 }}
            transition={{ 
              duration: isExiting ? 0.4 : 0.8, 
              delay: isExiting ? 0.6 : 1.2 
            }}
          >
            <div className="footer-content">
              <div className="footer-left-content">
                <div className="footer-social-links">
                  <a
                    href="http://instagram.com/pavillon46.ch"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="social-icon-link"
                    aria-label="Follow Pavillon 46 on Instagram"
                  >
                    <svg className="social-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" strokeWidth="2.2" />
                      <circle cx="12" cy="12" r="3.8" stroke="currentColor" strokeWidth="2.2" />
                      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
                    </svg>
                  </a>
                  <a
                    href="https://www.linkedin.com/company/pavillon46"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="social-icon-link"
                    aria-label="Visit Pavillon 46 on LinkedIn"
                  >
                    <svg className="social-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="4.2" y="8.8" width="3.2" height="10.8" fill="currentColor" />
                      <rect x="4.2" y="4.2" width="3.2" height="3.2" fill="currentColor" />
                      <path d="M10 8.8H13V10.3C13.6 9.2 14.8 8.4 16.4 8.4C19 8.4 20 10.2 20 13V19.6H16.8V13.8C16.8 12.4 16.3 11.4 14.9 11.4C13.6 11.4 13 12.3 13 13.8V19.6H10V8.8Z" fill="currentColor" />
                    </svg>
                  </a>
                </div>
              </div>

              <div className="footer-links-container">
                <a href="/legal" className="footer-link">
                  {tCommon.legal}
                </a>
                <span className="footer-separator">•</span>
                <a href="/privacy" className="footer-link">
                  {tCommon.privacy}
                </a>
              </div>

              <div className="footer-right-content">
                <a
                  href="https://www.elle.ch"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="footer-elle-mention"
                >
                  {tCommon.asSeenOnElle}
                </a>
              </div>
            </div>
          </motion.footer>

        </div>
      </PageLayout>
    </>
  )
}
