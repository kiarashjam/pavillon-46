import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { EASE_OUT } from '../lib/motion'

export default function Footer() {
  const { language } = useLanguage()
  const t = useTranslations(language, 'common')

  const renderElleMention = () => {
    if (t.asSeenOnElle.includes('ELLE')) {
      const [before, after] = t.asSeenOnElle.split('ELLE')
      return (
        <>
          {before}
          <span className="footer-elle-brand">ELLE</span>
          {after}
        </>
      )
    }
    return t.asSeenOnElle
  }

  return (
    <motion.footer
      className="page-footer"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.3 }}
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
          <Link to="/legal" className="footer-link">{t.legal}</Link>
          <span className="footer-separator">•</span>
          <Link to="/privacy" className="footer-link">{t.privacy}</Link>
        </div>

        <div className="footer-right-content">
          <a
            href="https://elle.ch/151015/lifestyle/pavillon-46-le-gout-des-instants-partages"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-elle-mention"
          >
            {renderElleMention()}
          </a>
        </div>
      </div>
    </motion.footer>
  )
}
