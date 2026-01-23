import Link from 'next/link'
import Image from 'next/image'
import { useLanguage } from '../contexts/LanguageContext'
import { motion } from 'framer-motion'

export default function Header() {
  const { language, changeLanguage } = useLanguage()

  const headerVariants = {
    hidden: { opacity: 0, y: -20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
  }

  return (
    <motion.header 
      className="page-header"
      variants={headerVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="header-left">
        <Link href="/" className="logo-link">
          <Image 
            src="/images/logo.png" 
            alt="PAVILLON 46" 
            width={120} 
            height={40}
            className="header-logo-image"
            priority
          />
        </Link>
      </div>
      <div className="header-right">
        <div className="language-switcher">
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
    </motion.header>
  )
}
