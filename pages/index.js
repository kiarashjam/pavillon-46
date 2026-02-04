import { useState } from 'react'
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

  const handleNavigate = (e) => {
    e.preventDefault()
    setIsExiting(true)
    // Wait for exit animations to complete before navigating
    setTimeout(() => {
      router.push('/waitlist')
    }, 1800) // Total exit animation time
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
            
            {/* JS-animated particles */}
            {[...Array(40)].map((_, i) => (
              <motion.div
                key={i}
                className="floating-dot"
                initial={{
                  x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1920),
                  y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 1080),
                  scale: Math.random() * 0.5 + 0.3,
                  opacity: Math.random() * 0.4 + 0.1
                }}
                animate={{
                  x: [
                    Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1920),
                    Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1920),
                    Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1920)
                  ],
                  y: [
                    Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 1080),
                    Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 1080),
                    Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 1080)
                  ],
                  opacity: [0.1, 0.5, 0.2, 0.4, 0.1],
                  scale: [0.3, 0.6, 0.4, 0.7, 0.3]
                }}
                transition={{
                  duration: Math.random() * 20 + 15,
                  repeat: Infinity,
                  ease: "linear",
                  repeatType: "reverse"
                }}
                style={{
                  width: Math.random() * 4 + 2 + 'px',
                  height: Math.random() * 4 + 2 + 'px',
                }}
              />
            ))}
          </div>

          {/* Waitlist background image underneath - preloaded for smooth transition */}
          <motion.div 
            className="preload-bg-container"
            initial={{ opacity: 0 }}
            animate={isExiting ? { opacity: 1 } : { opacity: 0 }}
            transition={{ 
              duration: 1.5, 
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
            animate={isExiting 
              ? { opacity: 0 } 
              : { opacity: 1 }
            }
            transition={{ 
              duration: isExiting ? 1.5 : 1.2, 
              delay: isExiting ? 0 : 0,
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
          <div className="invite-content">
            {/* Welcome text - letter by letter animation */}
            <motion.p 
              className="invite-welcome"
              initial={{ opacity: 0 }}
              animate={isExiting 
                ? { opacity: 0, y: -30, filter: 'blur(10px)', rotateX: -20 } 
                : { opacity: 1, y: 0, filter: 'blur(0px)', rotateX: 0 }
              }
              transition={{ 
                duration: isExiting ? 0.6 : 0.5, 
                delay: isExiting ? 0 : 0.2,
                ease: [0.25, 0.46, 0.45, 0.94] 
              }}
              style={{ perspective: '500px' }}
            >
              {t.welcomeText.split('').map((letter, index) => (
                <motion.span
                  key={index}
                  initial={{ 
                    opacity: 0, 
                    y: -40,
                    rotateY: -90,
                    scale: 0
                  }}
                  animate={isExiting 
                    ? { 
                        opacity: 0, 
                        y: -20, 
                        rotateY: 90,
                        scale: 0.5,
                        filter: 'blur(5px)'
                      } 
                    : { 
                        opacity: 1, 
                        y: 0, 
                        rotateY: 0,
                        scale: 1,
                        filter: 'blur(0px)'
                      }
                  }
                  transition={{ 
                    duration: 0.6, 
                    delay: isExiting ? index * 0.02 : 0.3 + index * 0.05,
                    ease: [0.25, 0.46, 0.45, 0.94]
                  }}
                  style={{ 
                    display: 'inline-block',
                    transformStyle: 'preserve-3d',
                    '--i': index
                  }}
                >
                  {letter === ' ' ? '\u00A0' : letter}
                </motion.span>
              ))}
            </motion.p>
            
            {/* Logo */}
            <motion.div 
              className="invite-logo"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={isExiting 
                ? { opacity: 0, scale: 0.8, filter: 'blur(10px)' } 
                : { opacity: 1, scale: 1, filter: 'blur(0px)' }
              }
              transition={{ 
                duration: isExiting ? 0.7 : 1, 
                delay: isExiting ? 0.15 : 0.5,
                ease: [0.25, 0.46, 0.45, 0.94] 
              }}
            >
              <motion.div
                animate={isExiting ? {} : { y: [0, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
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
            </motion.div>
            
            {/* Tagline with enhanced animations */}
            <motion.p 
              className="invite-tagline"
              initial={{ opacity: 0, y: 20 }}
              animate={isExiting 
                ? { opacity: 0, y: 30, filter: 'blur(10px)' } 
                : { opacity: 1, y: 0, filter: 'blur(0px)' }
              }
              transition={{ 
                duration: isExiting ? 0.6 : 0.8, 
                delay: isExiting ? 0.3 : 0.7,
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
                ? { opacity: 0, y: 40, scale: 0.9 } 
                : { opacity: 1, y: 0, scale: 1 }
              }
              transition={{ 
                duration: isExiting ? 0.5 : 0.8, 
                delay: isExiting ? 0.45 : 0.9,
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
          </div>

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
