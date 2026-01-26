import Head from 'next/head'
import Image from 'next/image'
import PageLayout from '../components/layouts/PageLayout'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { animationVariants, IMAGE_PATHS } from '../lib/constants'
import { motion } from 'framer-motion'

export default function ThankYou() {
  const { language } = useLanguage()
  const t = useTranslations(language, 'thankYou')

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

          {/* Thank You Overlay */}
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
              
              <motion.div 
                className="checkmark-icon"
                variants={animationVariants.checkmark}
              >
                <Image 
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
    </>
  )
}
