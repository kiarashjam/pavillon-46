import '../styles/globals.css'
import '../styles/desktop.css'
import '../styles/tablet.css'
import '../styles/mobile.css'
import localFont from 'next/font/local'
import Script from 'next/script'
import { LanguageProvider } from '../contexts/LanguageContext'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/router'

const jost = localFont({
  src: [
    {
      path: '../public/fonts/Jost/Jost-VariableFont_wght.ttf',
      style: 'normal',
    },
    {
      path: '../public/fonts/Jost/Jost-Italic-VariableFont_wght.ttf',
      style: 'italic',
    },
  ],
  variable: '--font-jost',
  display: 'swap',
})

function VisitorAnalytics() {
  const clarityProjectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID

  if (!clarityProjectId) {
    return null
  }

  return (
    <Script id="microsoft-clarity" strategy="afterInteractive">
      {`
        (function(c,l,a,r,i,t,y){
          c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
          t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
          y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
        })(window, document, "clarity", "script", "${clarityProjectId}");
      `}
    </Script>
  )
}

// Cross-fade page transition - pages overlap during transition
const pageTransition = {
  initial: {
    opacity: 0,
  },
  enter: {
    opacity: 1,
    transition: {
      duration: 2,
      ease: [0.22, 1, 0.36, 1],
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 2,
      ease: [0.22, 1, 0.36, 1],
    },
  },
}

export default function App({ Component, pageProps }) {
  const router = useRouter()

  return (
    <LanguageProvider>
      <VisitorAnalytics />
      <div className={jost.variable} style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden' }}>
        <AnimatePresence mode="sync" initial={true}>
          <motion.div
            key={router.asPath}
            initial="initial"
            animate="enter"
            exit="exit"
            variants={pageTransition}
            style={{ 
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              height: '100vh',
            }}
          >
            <Component {...pageProps} />
          </motion.div>
        </AnimatePresence>
      </div>
    </LanguageProvider>
  )
}
