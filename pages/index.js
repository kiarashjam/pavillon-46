import { useState, useEffect, useMemo } from 'react'
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
  const { language, changeLanguage } = useLanguage()
  const t = useTranslations(language, 'home')
  const tCommon = useTranslations(language, 'common')
  
  const [isExiting, setIsExiting] = useState(false)
  const [isBgTransitioning, setIsBgTransitioning] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    const checkMobile = () => setIsMobile(window.innerWidth <= 767)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Generate stable random values for particles (only used client-side)
  const particles = useMemo(() => {
    if (typeof window === 'undefined') return []
    const w = window.innerWidth
    const h = window.innerHeight
    return [...Array(40)].map(() => ({
      initialX: Math.random() * w,
      initialY: Math.random() * h,
      initialScale: Math.random() * 0.5 + 0.3,
      initialOpacity: Math.random() * 0.4 + 0.1,
      animateX: [Math.random() * w, Math.random() * w, Math.random() * w],
      animateY: [Math.random() * h, Math.random() * h, Math.random() * h],
      duration: Math.random() * 20 + 15,
      dotWidth: Math.random() * 4 + 2,
      dotHeight: Math.random() * 4 + 2,
    }))
  }, [isMounted]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleNavigate = (e) => {
    e.preventDefault()
    setIsExiting(true)

    if (isMobile) {
      // Mobile: fade content first (0.8s), then start background transition
      setTimeout(() => {
        setIsBgTransitioning(true)
      }, 800)
      // Navigate after both animations complete
      setTimeout(() => {
        router.push('/waitlist')
      }, 2200)
    } else {
      // Desktop: simultaneous animations
      setIsBgTransitioning(true)
      setTimeout(() => {
        router.push('/waitlist')
      }, 1800)
    }
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
          {/* Animated floating dots background */}
          <div className="floating-dots-container" aria-hidden="true">
            {/* CSS-animated orbs */}
            <div className="orb-1" />
            <div className="orb-2" />
            <div className="orb-3" />
            
            {/* JS-animated particles - only rendered client-side to avoid hydration mismatch */}
            {isMounted && particles.map((p, i) => (
              <motion.div
                key={i}
                className="floating-dot"
                initial={{
                  x: p.initialX,
                  y: p.initialY,
                  scale: p.initialScale,
                  opacity: p.initialOpacity
                }}
                animate={{
                  x: p.animateX,
                  y: p.animateY,
                  opacity: [0.1, 0.5, 0.2, 0.4, 0.1],
                  scale: [0.3, 0.6, 0.4, 0.7, 0.3]
                }}
                transition={{
                  duration: p.duration,
                  repeat: Infinity,
                  ease: "linear",
                  repeatType: "reverse"
                }}
                style={{
                  width: p.dotWidth + 'px',
                  height: p.dotHeight + 'px',
                }}
              />
            ))}
          </div>

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
            
            {/* Tagline with enhanced animations */}
            <motion.p 
              className="invite-tagline"
              initial={{ opacity: 0, y: 20 }}
              animate={isExiting 
                ? { opacity: 0, y: isMobile ? 0 : 30, filter: isMobile ? 'blur(0px)' : 'blur(10px)' } 
                : { opacity: 1, y: 0, filter: 'blur(0px)' }
              }
              transition={{ 
                duration: isExiting ? (isMobile ? 0.5 : 0.6) : 0.8, 
                delay: isExiting ? 0 : 0.7,
                ease: [0.25, 0.46, 0.45, 0.94] 
              }}
            >
              <motion.span
                initial={{ opacity: 0, x: -15 }}
                animate={isExiting ? { opacity: 0, x: -20 } : { opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
                style={{ display: 'inline-block' }}
              >
                {t.sloganPart1}{' '}
              </motion.span>
              <motion.span 
                className="tagline-highlight"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={isExiting 
                  ? { opacity: 0, scale: 0.8 } 
                  : { opacity: 1, scale: 1 }
                }
                transition={{ 
                  duration: 0.8, 
                  delay: 1,
                  ease: [0.25, 0.46, 0.45, 0.94]
                }}
                style={{ display: 'inline-block', marginLeft: '6px', marginRight: '6px' }}
              >
                {t.sloganPart2}
              </motion.span>
              <motion.span
                initial={{ opacity: 0, x: 15 }}
                animate={isExiting ? { opacity: 0, x: 20 } : { opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                style={{ display: 'inline-block' }}
              >
                {t.sloganPart3}
              </motion.span>
            </motion.p>
            
            {/* CTA Button */}
            <motion.div
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
            <a href="/legal" className="footer-link">
              {tCommon.legal}
            </a>
            <span className="footer-dot">•</span>
            <a href="/privacy" className="footer-link">
              {tCommon.privacy}
            </a>
          </motion.footer>

          {/* Language Switcher */}
          <motion.div 
            className="invite-lang-switcher"
            initial={{ opacity: 0 }}
            animate={isExiting ? { opacity: 0 } : { opacity: 1 }}
            transition={{ 
              duration: isExiting ? 0.3 : 0.6, 
              delay: isExiting ? 0.7 : 1.5 
            }}
          >
            <button
              className={`invite-lang-btn ${language === 'fr' ? 'active' : ''}`}
              onClick={() => changeLanguage('fr')}
            >
              FR
            </button>
            <span className="invite-lang-sep">|</span>
            <button
              className={`invite-lang-btn ${language === 'en' ? 'active' : ''}`}
              onClick={() => changeLanguage('en')}
            >
              EN
            </button>
          </motion.div>
        </div>
      </PageLayout>
    </>
  )
}
