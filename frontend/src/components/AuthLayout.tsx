import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { IMAGE_PATHS } from '../lib/constants'
import { EASE_SMOOTH_OUT } from '../lib/motion'

/**
 * Full-screen editorial split layout for the member auth pages (login,
 * set-password). Left: a cinematic brand panel. Right: a calm form panel that
 * receives the page-specific form as children.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const { language, changeLanguage } = useLanguage()
  const tHome = useTranslations(language, 'home')
  const tCommon = useTranslations(language, 'common')

  return (
    <div className="auth-page">
      <motion.aside
        className="auth-visual"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.1, ease: EASE_SMOOTH_OUT }}
      >
        <div className="auth-visual-media" aria-hidden="true" />
        <div className="auth-visual-veil" aria-hidden="true" />
        <div className="auth-visual-grain" aria-hidden="true" />

        <div className="auth-visual-inner">
          <motion.div
            className="auth-visual-top"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25, ease: EASE_SMOOTH_OUT }}
          >
            <Link to="/" className="auth-visual-logo">
              <img src={IMAGE_PATHS.logo} alt="PAVILLON 46" />
            </Link>
          </motion.div>

          <motion.div
            className="auth-visual-center"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.4, ease: EASE_SMOOTH_OUT }}
          >
            <span className="auth-eyebrow">{tCommon.memberPortal}</span>
            <p className="auth-visual-title">
              <span>{tHome.sloganPart1}</span>{' '}
              <span className="auth-visual-accent">{tHome.sloganPart2}</span>{' '}
              <span>{tHome.sloganPart3}</span>
            </p>
          </motion.div>

          <motion.div
            className="auth-visual-foot"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.7, ease: EASE_SMOOTH_OUT }}
          >
            <span className="auth-visual-foot-date">{tHome.openingDate}</span>
            <span className="auth-visual-foot-links">
              <Link to="/legal">{tCommon.legal}</Link>
              <span aria-hidden="true">·</span>
              <Link to="/privacy">{tCommon.privacy}</Link>
            </span>
          </motion.div>
        </div>
      </motion.aside>

      <main className="auth-panel">
        <header className="auth-panel-top">
          <Link to="/" className="auth-back">{tCommon.goBack}</Link>
          <div className="auth-lang" role="group" aria-label="Language switcher">
            <button
              type="button"
              className={language === 'fr' ? 'is-active' : ''}
              onClick={() => changeLanguage('fr')}
              aria-label="Français"
            >
              FR
            </button>
            <span aria-hidden="true">|</span>
            <button
              type="button"
              className={language === 'en' ? 'is-active' : ''}
              onClick={() => changeLanguage('en')}
              aria-label="English"
            >
              EN
            </button>
          </div>
        </header>

        <div className="auth-panel-body">{children}</div>
      </main>
    </div>
  )
}
