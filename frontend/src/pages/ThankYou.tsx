import { useEffect } from 'react'
import { motion } from 'framer-motion'
import PageLayout from '../components/PageLayout'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { animationVariants, IMAGE_PATHS } from '../lib/constants'

export default function ThankYou() {
  const { language } = useLanguage()
  const t = useTranslations(language, 'thankYou')

  useEffect(() => {
    document.title = t.title
  }, [t.title])

  return (
    <PageLayout>
      <div className="waitlist-page">
        <div className="background-container">
          <div className="background-image" />
        </div>

        <div className="form-overlay">
          <motion.div
            className="thank-you-container"
            variants={animationVariants.form}
            initial="hidden"
            animate="visible"
          >
            <motion.h1 className="thank-you-heading" variants={animationVariants.itemSmall}>
              {t.heading}
            </motion.h1>

            <motion.div className="checkmark-icon" variants={animationVariants.checkmark}>
              <img
                src={IMAGE_PATHS.checkmark}
                alt="Success"
                width={80}
                height={80}
                className="checkmark-svg"
              />
            </motion.div>

            <motion.div
              className="confirmation-messages"
              variants={animationVariants.container}
              initial="hidden"
              animate="visible"
            >
              <motion.p className="confirmation-text" variants={animationVariants.itemSmall}>
                {t.message1}
              </motion.p>
              <motion.p className="confirmation-text" variants={animationVariants.itemSmall}>
                {t.message2}
              </motion.p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </PageLayout>
  )
}
