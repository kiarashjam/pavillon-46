import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { IMAGE_PATHS } from '../lib/constants'
import { EASE_OUT } from '../lib/motion'

export default function Header() {
  const { language, changeLanguage } = useLanguage()
  const location = useLocation()
  const isHomePage = location.pathname === '/'
  const tHome = useTranslations(language, 'home')

  return (
    <motion.header
      className={`page-header${isHomePage ? ' is-home' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
    >
      <div className="header-left">
        <Link to="/" className="logo-link">
          <img
            src={IMAGE_PATHS.logo}
            alt="PAVILLON 46"
            width={120}
            height={40}
            className="header-logo-image"
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
