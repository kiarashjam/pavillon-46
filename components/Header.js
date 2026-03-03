import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { IMAGE_PATHS } from '../lib/constants'
import { motion } from 'framer-motion'

export default function Header() {
  const { language, changeLanguage } = useLanguage()
  const router = useRouter()
  const isHomePage = router.pathname === '/'
  const tHome = useTranslations(language, 'home')

  const handleLogoNavigation = (e) => {
    if (isHomePage) return

    // Ensure page-level scroll locks do not leak across routes.
    document.body.classList.remove('no-scroll')
    document.documentElement.classList.remove('no-scroll')

    // Add a brief visual transition, then force a clean homepage mount.
    e.preventDefault()
    const appRoot = document.getElementById('__next')
    if (appRoot) {
      appRoot.style.transition = 'opacity 220ms cubic-bezier(0.25, 0.46, 0.45, 0.94)'
      appRoot.style.opacity = '0.4'
    }

    window.setTimeout(() => {
      window.location.href = '/'
    }, 220)
  }

  const headerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.5,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
  }

  return (
    <motion.header 
      className={`page-header${isHomePage ? ' is-home' : ''}`}
      variants={headerVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="header-left">
        <Link href="/" className="logo-link" onClick={handleLogoNavigation}>
          <Image 
            src={IMAGE_PATHS.logo}
            alt="PAVILLON 46" 
            width={120} 
            height={40}
            className="header-logo-image"
            priority
          />
        </Link>
      </div>
      <div className="header-center">
        <div className="language-switcher" role="group" aria-label="Language switcher">
          <button
            className={`lang-button ${language === 'fr' ? 'active' : ''}`}
            onClick={() => changeLanguage('fr')}
            aria-label="Switch to French"
          >
            FR
          </button>
          <span className="lang-separator">|</span>
          <button
            className={`lang-button ${language === 'en' ? 'active' : ''}`}
            onClick={() => changeLanguage('en')}
            aria-label="Switch to English"
          >
            EN
          </button>
        </div>
      </div>
      <div className="header-right">
        <span className="opening-date-header">{tHome.openingDate}</span>
      </div>
    </motion.header>
  )
}
