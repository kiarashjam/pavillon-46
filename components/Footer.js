import { motion } from 'framer-motion'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'

export default function Footer() {
  const { language } = useLanguage()
  const t = useTranslations(language, 'common')

  const footerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.5,
        ease: [0.25, 0.46, 0.45, 0.94],
        delay: 0.3,
      },
    },
  }

  return (
    <motion.footer 
      className="page-footer"
      variants={footerVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="footer-links-container">
        <a href="#" className="footer-link" onClick={(e) => e.preventDefault()}>{t.legal}</a>
        <span className="footer-separator">•</span>
        <a href="#" className="footer-link" onClick={(e) => e.preventDefault()}>{t.privacy}</a>
      </div>
    </motion.footer>
  )
}
