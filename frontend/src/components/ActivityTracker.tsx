import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const BLOCKED_PATH_PREFIXES = ['/admin/activity']
const SESSION_STORAGE_KEY = 'p46_activity_session_id'

interface ActivityPayload {
  type: 'page_view' | 'click'
  path: string
  element?: { tag: string; id: string; text: string }
}

function ensureSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_STORAGE_KEY)
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId)
  }
  return sessionId
}

function sendEvent(payload: ActivityPayload, sessionId: string) {
  if (!payload.path) return
  if (BLOCKED_PATH_PREFIXES.some((prefix) => payload.path.startsWith(prefix))) return

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
  }).catch(() => {
    /* ignore */
  })
}

export default function ActivityTracker() {
  const location = useLocation()

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (import.meta.env.VITE_ACTIVITY_LOG_ENABLED === 'false') return undefined

    const sessionId = ensureSessionId()
    sendEvent({ type: 'page_view', path: location.pathname }, sessionId)
  }, [location.pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (import.meta.env.VITE_ACTIVITY_LOG_ENABLED === 'false') return undefined

    const sessionId = ensureSessionId()

    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest('a,button,[data-track]')
        : null
      if (!target) return

      const label =
        target.getAttribute('data-track')?.trim() ||
        target.getAttribute('aria-label')?.trim() ||
        (target.textContent || '').trim().replace(/\s+/g, ' ')
      const text = label.slice(0, 80)

      sendEvent(
        {
          type: 'click',
          path: window.location.pathname,
          element: {
            tag: target.tagName.toLowerCase(),
            id: target.id || '',
            text,
          },
        },
        sessionId,
      )
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [])

  return null
}
