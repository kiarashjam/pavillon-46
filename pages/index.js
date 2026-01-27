import Link from 'next/link'
import Head from 'next/head'
import Image from 'next/image'
import PageLayout from '../components/layouts/PageLayout'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslations } from '../lib/translations'
import { animationVariants, IMAGE_PATHS } from '../lib/constants'
import { motion } from 'framer-motion'

export default function Home() {
  const { language } = useLanguage()
  const t = useTranslations(language, 'home')
  const tCommon = useTranslations(language, 'common')

  return (
    <>
      <Head>
        <title>{t.title}</title>
        <meta name="description" content={t.description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <PageLayout showFooter={false}>
        <div className="container">
          {/* Full-page: image 6 background */}
          <div className="page-bg" aria-hidden="true" />
          {/* Full-page: blur + dark overlay (makes background not clear) */}
          <div className="page-overlay" aria-hidden="true" />

          {/* Left Section: image 4 + legal */}
          <div className="left-section">
            <div className="left-image" aria-hidden="true" />
            <div className="legal-wrap">
              <div className="legal-line" />
              <div className="legal-text">{tCommon.legal}</div>
            </div>
          </div>

          {/* Right Section: content */}
          <div className="right-section">
            <motion.div 
              className="right-content"
              variants={animationVariants.container}
              initial="hidden"
              animate="visible"
            >
              <motion.div className="welcome-text" variants={animationVariants.item}>
                {t.welcomeText}
              </motion.div>
              <motion.div className="logo-container" variants={animationVariants.logo}>
                <div className="logo-main">
                  <Image 
                    src={IMAGE_PATHS.logo}
                    alt="PAVILLON 46" 
                    width={400} 
                    height={160}
                    className="logo-image"
                    priority
                  />
                </div>
              </motion.div>
              <motion.div className="slogan" variants={animationVariants.item}>
                <span className="slogan-part1">{t.sloganPart1}</span>
                <span className="slogan-part2">{t.sloganPart2}</span>
                <span className="slogan-part3">{t.sloganPart3}</span>
              </motion.div>
              <motion.div variants={animationVariants.item}>
                <Link href="/waitlist" className="join-button">
                  <span className="button-text">{t.joinButton}</span>
                </Link>
              </motion.div>
              <motion.p className="footer-text" variants={animationVariants.item}>
                {t.footerText}
              </motion.p>
            </motion.div>
          </div>
        </div>
      </PageLayout>
    </>
  )
}
