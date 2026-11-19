// Reports uncaught browser errors to the API (POST /api/client-errors), which
// logs them for monitoring. Fire and forget: duplicates are dropped, at most
// MAX_REPORTS go out per page load, and nothing here ever throws — a reporter
// that broke the page would be worse than none.
import { apiUrl } from './apiBase'

const MAX_REPORTS = 10

// Same caps as ClientErrorsController, so a report always fits its 16 KB limit.
const LIMITS = { message: 500, stack: 4000, url: 500, componentStack: 4000, userAgent: 300 }

export interface ClientErrorReport {
  message: string
  stack?: string
  url?: string
  componentStack?: string
  userAgent?: string
}

const seen = new Set<string>()
let sent = 0
let installed = false

function cap(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const s = value.trim()
  return s ? s.slice(0, max) : undefined
}

function describe(reason: unknown): string {
  if (reason instanceof Error) return reason.message ? `${reason.name}: ${reason.message}` : reason.name
  if (typeof reason === 'string') return reason
  if (reason && typeof reason === 'object' && 'message' in reason) return String((reason as { message: unknown }).message)
  return String(reason)
}

/** Sends one report. Call it from an error boundary too, with React's componentStack. */
export function reportClientError(reason: unknown, componentStack?: string): void {
  try {
    if (sent >= MAX_REPORTS) return
    const message = cap(describe(reason), LIMITS.message)
    if (!message) return
    const stack = cap(reason instanceof Error ? reason.stack : undefined, LIMITS.stack)
    const key = `${message}\n${(stack ?? '').slice(0, 300)}`
    if (seen.has(key)) return
    seen.add(key)
    sent += 1

    const report: ClientErrorReport = {
      message,
      stack,
      // Never the query string or fragment: reset, welcome and invitation links
      // carry their tokens there.
      url: cap(`${window.location.origin}${window.location.pathname}`, LIMITS.url),
      componentStack: cap(componentStack, LIMITS.componentStack),
      userAgent: cap(navigator.userAgent, LIMITS.userAgent),
    }
    // Same transport as ActivityTracker: keepalive so a report sent while the
    // page unloads still leaves; no credentials, so plain CORS is enough.
    fetch(apiUrl('/api/client-errors'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {
      /* ignore: nowhere left to report it */
    })
  } catch {
    /* never throw from the reporter */
  }
}

/** Listens for uncaught errors and unhandled promise rejections. Call once, before the first render. */
export function installErrorReporter(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  // An uncaught render error reaches window too: there is no error boundary.
  window.addEventListener('error', (event: ErrorEvent) => {
    reportClientError(event.error ?? event.message)
  })
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    reportClientError(event.reason)
  })
}
