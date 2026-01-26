import Link from 'next/link'
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
        <Link href="/legal" className="footer-link">{t.legal}</Link>
        <span className="footer-separator">•</span>
        <Link href="/privacy" className="footer-link">{t.privacy}</Link>
      </div>
    </motion.footer>
  )
}
