import '../styles/globals.css'
import '../styles/desktop.css'
import '../styles/tablet.css'
import '../styles/mobile.css'
import { Jost } from 'next/font/google'
import { LanguageProvider } from '../contexts/LanguageContext'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/router'
import { animationVariants } from '../lib/constants'

const jost = Jost({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-jost',
  display: 'swap',
})

export default function App({ Component, pageProps }) {
  const router = useRouter()

  return (
    <LanguageProvider>
      <div className={jost.variable}>
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
