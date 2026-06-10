import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Language } from '../lib/translations'

interface LanguageContextValue {
  language: Language
  changeLanguage: (lang: Language) => void
  languageChanged: boolean
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)

const STORAGE_KEY = 'pavillon46-language'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('fr')
  const [languageChanged, setLanguageChanged] = useState(false)
  const isInitialMount = useRef(true)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'fr' || saved === 'en') {
      setLanguage(saved)
    } else {
      setLanguage('fr')
    }
    isInitialMount.current = false
  }, [])

  const changeLanguage = (lang: Language) => {
    if (lang !== 'fr' && lang !== 'en') return
    const previous = language
    setLanguage(lang)
    localStorage.setItem(STORAGE_KEY, lang)
    if (!isInitialMount.current && previous !== lang) {
      setLanguageChanged(true)
      window.setTimeout(() => setLanguageChanged(false), 100)
    }
  }

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, languageChanged }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}
