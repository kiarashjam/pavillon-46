import '../styles/globals.css'
import '../styles/desktop.css'
import '../styles/tablet.css'
import '../styles/mobile.css'
import localFont from 'next/font/local'
import { useEffect } from 'react'
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

function InternalActivityTracker() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const disabled = process.env.NEXT_PUBLIC_ACTIVITY_LOG_ENABLED === 'false'
    if (disabled) return undefined

    const blockedPathPrefixes = ['/admin/activity']
    const storageKey = 'p46_activity_session_id'
    let sessionId = localStorage.getItem(storageKey)
    if (!sessionId) {
      sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
      localStorage.setItem(storageKey, sessionId)
    }

    const sendEvent = (payload) => {
      if (!payload?.path) return
      if (blockedPathPrefixes.some((prefix) => payload.path.startsWith(prefix))) return

      const body = JSON.stringify({
        ...payload,
        sessionId,
        ts: new Date().toISOString(),
      })

      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' })
        navigator.sendBeacon('/api/activity/log', blob)
        return
      }

      fetch('/api/activity/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    }

    const trackPageView = (path) => {
      sendEvent({ type: 'page_view', path })
    }

    const trackClick = (event) => {
      const target = event.target instanceof Element ? event.target.closest('a,button,[data-track]') : null
      if (!target) return

      const label =
        target.getAttribute('data-track')?.trim() ||
        target.getAttribute('aria-label')?.trim() ||
        (target.textContent || '').trim().replace(/\s+/g, ' ')
      const text = label.slice(0, 80)
      sendEvent({
        type: 'click',
        path: window.location.pathname,
        element: {
          tag: target.tagName.toLowerCase(),
          id: target.id || '',
          text,
        },
      })
    }

    trackPageView(window.location.pathname)
    router.events.on('routeChangeComplete', trackPageView)
    document.addEventListener('click', trackClick, true)

    return () => {
      router.events.off('routeChangeComplete', trackPageView)
      document.removeEventListener('click', trackClick, true)
    }
  }, [router])

  return null
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
      <InternalActivityTracker />
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
