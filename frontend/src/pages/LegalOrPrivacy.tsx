import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import PageLayout from '../components/PageLayout'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { animationVariants } from '../lib/constants'

interface LegalOrPrivacyProps {
  section: 'legal' | 'privacy'
}

export default function LegalOrPrivacy({ section }: LegalOrPrivacyProps) {
  const { language } = useLanguage()
  const t = useTranslations(language, section)
  const tCommon = useTranslations(language, 'common')

  useEffect(() => {
    document.title = t.title
  }, [t.title])

  const dateString = new Date().toLocaleDateString(
    language === 'fr' ? 'fr-CH' : 'en-US',
    { year: 'numeric', month: 'long', day: 'numeric' },
  )

  const sections: Array<{ number: string; title: string; content: string; isContact?: boolean }> = [
    { number: '01', title: t.section1Title, content: t.section1Content },
    { number: '02', title: t.section2Title, content: t.section2Content },
    { number: '03', title: t.section3Title, content: t.section3Content },
    { number: '04', title: t.section4Title, content: t.section4Content },
    { number: '05', title: t.section5Title, content: t.section5Content },
    { number: '06', title: t.section6Title, content: t.section6Content },
    { number: '07', title: t.section7Title, content: t.section7Content },
    { number: '08', title: t.section8Title, content: t.section8Content },
    { number: '09', title: t.section9Title, content: t.section9Content, isContact: true },
  ]

  return (
    <PageLayout>
      <div className="waitlist-page">
        <div className="background-container">
          <div className="background-image" />
        </div>

        <div className="form-overlay">
          <motion.div
            className="legal-privacy-container"
            variants={animationVariants.form}
            initial="hidden"
            animate="visible"
          >
            <motion.div className="legal-privacy-header" variants={animationVariants.itemSmall}>
              <Link to="/" className="back-link">{tCommon.goBack}</Link>
              <h1 className="legal-privacy-heading">{t.heading}</h1>
              <p className="legal-privacy-updated">{t.lastUpdated} {dateString}</p>
            </motion.div>

            <motion.div
              className="legal-privacy-content"
              variants={animationVariants.container}
              initial="hidden"
              animate="visible"
            >
              {sections.map((s) => (
                <motion.section
                  key={s.number}
                  className={`legal-privacy-section${s.isContact ? ' legal-privacy-section-contact' : ''}`}
                  variants={animationVariants.itemSmall}
                >
                  <div className="section-header">
                    <div className="section-number">{s.number}</div>
                    <h2 className="legal-privacy-section-title">{s.title}</h2>
                  </div>
                  <div className="section-content-wrapper">
                    <p className="legal-privacy-section-content">{s.content}</p>
                    {s.isContact && (
                      <div className="contact-info">
                        <a href={`mailto:${t.contactEmail}`} className="legal-privacy-link contact-link">
                          <span className="contact-icon">✉</span>
                          {t.contactEmail}
                        </a>
                        <div className="contact-location">
                          <span className="contact-icon">📍</span>
                          {t.location}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.section>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </PageLayout>
  )
}
