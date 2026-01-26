import '../styles/globals.css'
import '../styles/desktop.css'
import '../styles/tablet.css'
import '../styles/mobile.css'
import { Jost, Great_Vibes } from 'next/font/google'
import { LanguageProvider } from '../contexts/LanguageContext'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/router'
import LanguageNotification from '../components/LanguageNotification'
import { animationVariants } from '../lib/constants'

// Secondary Font: Jost (Google Fonts)
const jost = Jost({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-secondary',
  display: 'swap',
})

const greatVibes = Great_Vibes({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-script',
  display: 'swap',
})

export default function App({ Component, pageProps }) {
  const router = useRouter()

  return (
    <LanguageProvider>
      <div className={`${jost.variable} ${greatVibes.variable}`}>
        <LanguageNotification />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={router.asPath}
            initial="initial"
            animate="enter"
            exit="exit"
            variants={animationVariants.page}
          >
            <Component {...pageProps} />
          </motion.div>
        </AnimatePresence>
      </div>
    </LanguageProvider>
  )
}
