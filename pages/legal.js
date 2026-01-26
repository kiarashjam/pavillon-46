import Head from 'next/head'
import Link from 'next/link'
import PageLayout from '../components/layouts/PageLayout'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { animationVariants } from '../lib/constants'
import { motion } from 'framer-motion'

export default function Legal() {
  const { language } = useLanguage()
  const t = useTranslations(language, 'legal')
  const tCommon = useTranslations(language, 'common')

  return (
    <>
      <Head>
        <title>{t.title}</title>
        <meta name="description" content={t.description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <PageLayout>
        <div className="waitlist-page">
          {/* Background Image Container */}
          <div className="background-container">
            <div className="background-image"></div>
          </div>

          {/* Content Overlay */}
          <div className="form-overlay">
            <motion.div 
              className="legal-privacy-container"
              variants={animationVariants.form}
              initial="hidden"
              animate="visible"
            >
              <motion.div className="legal-privacy-header" variants={animationVariants.itemSmall}>
                <Link href="/" className="back-link">
                  {tCommon.goBack}
                </Link>
                <h1 className="legal-privacy-heading">{t.heading}</h1>
                <p className="legal-privacy-updated">{t.lastUpdated} {new Date().toLocaleDateString(language === 'fr' ? 'fr-CH' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </motion.div>
              
              <motion.div 
                className="legal-privacy-content"
                variants={animationVariants.container}
                initial="hidden"
                animate="visible"
              >
                <motion.section className="legal-privacy-section" variants={animationVariants.itemSmall}>
                  <h2 className="legal-privacy-section-title">{t.section1Title}</h2>
                  <p className="legal-privacy-section-content">{t.section1Content}</p>
                </motion.section>

                <motion.section className="legal-privacy-section" variants={animationVariants.itemSmall}>
                  <h2 className="legal-privacy-section-title">{t.section2Title}</h2>
                  <p className="legal-privacy-section-content">{t.section2Content}</p>
                </motion.section>

                <motion.section className="legal-privacy-section" variants={animationVariants.itemSmall}>
                  <h2 className="legal-privacy-section-title">{t.section3Title}</h2>
                  <p className="legal-privacy-section-content">{t.section3Content}</p>
                </motion.section>

                <motion.section className="legal-privacy-section" variants={animationVariants.itemSmall}>
                  <h2 className="legal-privacy-section-title">{t.section4Title}</h2>
                  <p className="legal-privacy-section-content">{t.section4Content}</p>
                </motion.section>

                <motion.section className="legal-privacy-section" variants={animationVariants.itemSmall}>
                  <h2 className="legal-privacy-section-title">{t.section5Title}</h2>
                  <p className="legal-privacy-section-content">{t.section5Content}</p>
                </motion.section>

                <motion.section className="legal-privacy-section" variants={animationVariants.itemSmall}>
                  <h2 className="legal-privacy-section-title">{t.section6Title}</h2>
                  <p className="legal-privacy-section-content">{t.section6Content}</p>
                </motion.section>

                <motion.section className="legal-privacy-section" variants={animationVariants.itemSmall}>
                  <h2 className="legal-privacy-section-title">{t.section7Title}</h2>
                  <p className="legal-privacy-section-content">{t.section7Content}</p>
                </motion.section>

                <motion.section className="legal-privacy-section" variants={animationVariants.itemSmall}>
                  <h2 className="legal-privacy-section-title">{t.section8Title}</h2>
                  <p className="legal-privacy-section-content">{t.section8Content}</p>
                </motion.section>

                <motion.section className="legal-privacy-section" variants={animationVariants.itemSmall}>
                  <h2 className="legal-privacy-section-title">{t.section9Title}</h2>
                  <p className="legal-privacy-section-content">
                    {t.section9Content}
                    <br />
                    <a href={`mailto:${t.contactEmail}`} className="legal-privacy-link">{t.contactEmail}</a>
                    <br />
                    {t.location}
                  </p>
                </motion.section>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </PageLayout>
    </>
  )
}
