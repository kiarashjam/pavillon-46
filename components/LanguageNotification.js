import { motion, AnimatePresence } from 'framer-motion'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { useEffect, useState, useRef } from 'react'

export default function LanguageNotification() {
  const { language, languageChanged } = useLanguage()
  const t = useTranslations(language, 'language')
  const [show, setShow] = useState(false)
  const prevLanguageRef = useRef(language)
  const timerRef = useRef(null)
  const isInitialMount = useRef(true)

  useEffect(() => {
    // Skip on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false
      prevLanguageRef.current = language
      return
    }

    // Check if language actually changed
    if (prevLanguageRef.current !== language && languageChanged) {
      // Clear any existing timer first
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      
      // Show the notification
      setShow(true)
      prevLanguageRef.current = language
      
      // Set timer to hide after 3.5 seconds (progress bar duration)
      timerRef.current = setTimeout(() => {
        setShow(false)
        timerRef.current = null
      }, 3500)
    }
  }, [language, languageChanged])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  // Force hide if show is false (safety check)
  useEffect(() => {
    if (!show && timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [show])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="language-notification"
          className="language-notification"
          initial={{ 
            opacity: 0,
            y: -20,
            scale: 0.95,
            x: 20
          }}
          animate={{ 
            opacity: 1,
            y: 0,
            scale: 1,
            x: 0
          }}
          exit={{ 
            opacity: 0,
            y: -10,
            scale: 0.95,
            x: 10,
            transition: {
              duration: 0.25,
              ease: [0.4, 0, 0.2, 1]
            }
          }}
          transition={{
            duration: 0.4,
            ease: [0.16, 1, 0.3, 1],
            type: "spring",
            stiffness: 300,
            damping: 30
          }}
        >
          <div className="language-notification-content">
            <span className="language-notification-text">
              {language === 'fr' ? t.changedToFrench : t.changedToEnglish}
            </span>
          </div>
          <div className="language-notification-progress">
            <motion.div
              className="language-notification-progress-bar"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ 
                duration: 3.5, 
                ease: [0.4, 0, 0.2, 1],
                delay: 0.1
              }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
