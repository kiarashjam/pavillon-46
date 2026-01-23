import { createContext, useContext, useState, useEffect, useRef } from 'react'

const LanguageContext = createContext()

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState('fr') // Default to French
  const [languageChanged, setLanguageChanged] = useState(false)
  const isInitialMount = useRef(true)

  // Load language preference from localStorage on mount
  useEffect(() => {
    const savedLanguage = localStorage.getItem('pavillon46-language')
    if (savedLanguage && (savedLanguage === 'fr' || savedLanguage === 'en')) {
      setLanguage(savedLanguage)
    }
    isInitialMount.current = false
  }, [])

  // Save language preference to localStorage when it changes
  const changeLanguage = (lang) => {
    if (lang === 'fr' || lang === 'en') {
      const previousLanguage = language
      setLanguage(lang)
      localStorage.setItem('pavillon46-language', lang)
      
      // Only show notification if language actually changed (not on initial load)
      if (!isInitialMount.current && previousLanguage !== lang) {
        setLanguageChanged(true)
        // Reset the flag after a short delay
        setTimeout(() => setLanguageChanged(false), 100)
      }
    }
  }

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, languageChanged }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
