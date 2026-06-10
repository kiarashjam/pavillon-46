import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import PageLayout from '../components/PageLayout'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { IMAGE_PATHS } from '../lib/constants'
import { EASE_OUT } from '../lib/motion'

export default function Home() {
  const navigate = useNavigate()
  const { language } = useLanguage()
  const t = useTranslations(language, 'home')
  const tCommon = useTranslations(language, 'common')

  const [isExiting, setIsExiting] = useState(false)
  const [isBgTransitioning, setIsBgTransitioning] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const exitTimerIdsRef = useRef<number[]>([])

  useEffect(() => {
    document.title = t.title
  }, [t.title])

  const clearExitTimers = () => {
    exitTimerIdsRef.current.forEach((id) => window.clearTimeout(id))
    exitTimerIdsRef.current = []
  }

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 767)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => () => clearExitTimers(), [])

  const scheduleExit = (fn: () => void, delayMs: number) => {
    const id = window.setTimeout(() => {
      exitTimerIdsRef.current = exitTimerIdsRef.current.filter((x) => x !== id)
      fn()
    }, delayMs)
    exitTimerIdsRef.current.push(id)
  }

  const navigateWithExit = (path: string) => {
    if (isExiting) return
    clearExitTimers()
    setIsExiting(true)

    if (isMobile) {
      scheduleExit(() => setIsBgTransitioning(true), 800)
      scheduleExit(() => navigate(path), 2200)
    } else {
      setIsBgTransitioning(true)
      scheduleExit(() => navigate(path), 1800)
    }
  }

  return (
    <PageLayout showFooter={false}>
      <div className="invite-only-page">
        <motion.div
          className="preload-bg-container"
          initial={{ opacity: 0 }}
          animate={isBgTransitioning ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 1.2, ease: EASE_OUT }}
          aria-hidden="true"
        >
          <div className="preload-bg-image" />
        </motion.div>

        <motion.div
          className="vector-46-container"
          initial={{ opacity: 0 }}
          animate={isBgTransitioning ? { opacity: 0 } : { opacity: 1 }}
          transition={{ duration: 1.2, ease: EASE_OUT }}
          aria-hidden="true"
        >
          <img src="/images/Vector.png" alt="" className="vector-46-image" />
        </motion.div>

        <motion.div
          className="invite-content"
          initial={{ opacity: 1 }}
          animate={isExiting ? { opacity: 0 } : { opacity: 1 }}
          transition={{
            duration: isExiting ? (isMobile ? 0.7 : 1.0) : 0.3,
            delay: isExiting ? (isMobile ? 0 : 0.4) : 0,
            ease: EASE_OUT,
          }}
        >
          <motion.p
            className="invite-welcome"
            initial={{ opacity: 1 }}
            animate={
              isExiting
                ? { opacity: 0, y: isMobile ? 0 : -30, filter: isMobile ? 'blur(0px)' : 'blur(10px)' }
                : { opacity: 1, y: 0, filter: 'blur(0px)' }
            }
            transition={{ duration: isExiting ? (isMobile ? 0.5 : 0.6) : 0.5, ease: EASE_OUT }}
          >
            {t.welcomeText}
          </motion.p>

          <motion.div
            className="invite-logo"
            initial={{ opacity: 1 }}
            animate={
              isExiting
                ? { opacity: 0, scale: isMobile ? 1 : 0.8, filter: isMobile ? 'blur(0px)' : 'blur(10px)' }
                : { opacity: 1, scale: 1, filter: 'blur(0px)' }
            }
            transition={{ duration: isExiting ? (isMobile ? 0.5 : 0.7) : 0.5, ease: EASE_OUT }}
          >
            <img
              src={IMAGE_PATHS.logo}
              alt="PAVILLON 46"
              width={340}
              height={140}
              className="invite-logo-image"
            />
          </motion.div>

          <p className="invite-tagline">
            <span style={{ display: 'inline-block' }}>{t.sloganPart1}{' '}</span>
            <span
              className="tagline-highlight"
              style={{ display: 'inline-block', marginLeft: '6px', marginRight: '6px' }}
            >
              {t.sloganPart2}
            </span>
            <span style={{ display: 'inline-block' }}>{t.sloganPart3}</span>
          </p>

          <motion.div
            className="invite-cta"
            initial={{ opacity: 0, y: 20 }}
            animate={
              isExiting
                ? { opacity: 0, y: isMobile ? 0 : 40, scale: isMobile ? 1 : 0.9 }
                : { opacity: 1, y: 0, scale: 1 }
            }
            transition={{
              duration: isExiting ? 0.5 : 0.8,
              delay: isExiting ? 0 : 0.9,
              ease: EASE_OUT,
            }}
          >
            <motion.button
              onClick={() => navigateWithExit('/waitlist')}
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
              onClick={(e) => {
                e.preventDefault()
                navigateWithExit('/login')
              }}
              whileHover={{ y: -1, opacity: 0.85 }}
            >
              {tCommon.alreadyMember}
            </motion.a>
          </motion.div>
        </motion.div>

        <motion.footer
          className="invite-footer"
          initial={{ opacity: 0 }}
          animate={isExiting ? { opacity: 0 } : { opacity: 1 }}
          transition={{ duration: isExiting ? 0.4 : 0.8, delay: isExiting ? 0.6 : 1.2 }}
        >
          <div className="footer-content">
            <div className="footer-left-content">
              <div className="footer-social-links">
                <a
                  href="https://www.instagram.com/pavillon.46/"
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
                    <path
                      d="M10 8.8H13V10.3C13.6 9.2 14.8 8.4 16.4 8.4C19 8.4 20 10.2 20 13V19.6H16.8V13.8C16.8 12.4 16.3 11.4 14.9 11.4C13.6 11.4 13 12.3 13 13.8V19.6H10V8.8Z"
                      fill="currentColor"
                    />
                  </svg>
                </a>
              </div>
            </div>

            <div className="footer-links-container">
              <Link to="/legal" className="footer-link">{tCommon.legal}</Link>
              <span className="footer-separator">•</span>
              <Link to="/privacy" className="footer-link">{tCommon.privacy}</Link>
            </div>

            <div className="footer-right-content">
              <a
                href="https://elle.ch/151015/lifestyle/pavillon-46-le-gout-des-instants-partages"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-elle-mention"
              >
                {tCommon.asSeenOnElle.includes('ELLE') ? (
                  (() => {
                    const [before, after] = tCommon.asSeenOnElle.split('ELLE')
                    return (
                      <>
                        {before}
                        <span className="footer-elle-brand">ELLE</span>
                        {after}
                      </>
                    )
                  })()
                ) : (
                  tCommon.asSeenOnElle
                )}
              </a>
            </div>
          </div>
        </motion.footer>
      </div>
    </PageLayout>
  )
}
