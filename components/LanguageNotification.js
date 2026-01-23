import { motion, AnimatePresence } from 'framer-motion'
import { useLanguage } from '../contexts/LanguageContext'
import { useEffect, useState, useRef } from 'react'

export default function LanguageNotification() {
  const { language, languageChanged } = useLanguage()
  const [show, setShow] = useState(false)
  const prevLanguageRef = useRef(language)

  useEffect(() => {
    // Only show notification if language actually changed (not on initial mount)
    if (languageChanged && prevLanguageRef.current !== language) {
      setShow(true)
      prevLanguageRef.current = language
      
      // Hide after 3 seconds
      const timer = setTimeout(() => {
        setShow(false)
      }, 3000)
      
      return () => clearTimeout(timer)
    } else {
      prevLanguageRef.current = language
    }
  }, [language, languageChanged])

  const translations = {
    fr: {
      message: 'Langue changée en français',
    },
    en: {
      message: 'Language changed to English',
    },
  }

  const t = translations[language] || translations.fr

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="language-notification"
          initial={{ opacity: 0, y: -50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.9 }}
          transition={{
            duration: 0.4,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
        >
          <div className="language-notification-content">
            <span className="language-notification-icon">🌐</span>
            <span className="language-notification-text">{t.message}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
