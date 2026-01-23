import '../styles/globals.css'
import { Jost, Great_Vibes } from 'next/font/google'
import { LanguageProvider } from '../contexts/LanguageContext'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/router'
import LanguageNotification from '../components/LanguageNotification'

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

const pageVariants = {
  initial: {
    opacity: 0,
    y: 20,
  },
  enter: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
}

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
            variants={pageVariants}
          >
            <Component {...pageProps} />
          </motion.div>
        </AnimatePresence>
      </div>
    </LanguageProvider>
  )
}
