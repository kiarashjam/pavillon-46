/**
 * First-party activity logging — keep stored and emailed data minimal.
 */

const EMAIL_LIKE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi
/** International-style numbers only (avoids redacting dates or short codes) */
const PHONE_LIKE = /(?:\+|00)\d[\d\s().-]{8,}\d\b/g

/**
 * HTTP Referer → hostname only (drops path, query, hash; fewer leaked search tokens).
 */
export function publicReferrer(referrer) {
  const r = String(referrer || '').trim()
  if (!r) return ''
  if (r === 'internal') return r
  try {
    const u = new URL(r)
    return (u.hostname || '').toLowerCase() || ''
  } catch {
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(r)) return r.toLowerCase()
    return ''
  }
}

/**
 * Short click / UI labels; strip obvious email and long phone-like runs.
 */
export function publicClickText(text, maxLen = 48) {
  let s = String(text || '').trim().replace(/\s+/g, ' ')
  s = s.replace(EMAIL_LIKE, '[redacted]')
  s = s.replace(PHONE_LIKE, '[redacted]')
  if (s.length > maxLen) return `${s.slice(0, Math.max(1, maxLen - 1))}…`
  return s
}

export function publicUserAgent(ua, maxLen = 140) {
  const s = String(ua || '').trim()
  if (!s) return ''
  if (s.length <= maxLen) return s
  return `${s.slice(0, Math.max(1, maxLen - 1))}…`
}

/** Apply before reporting / export so legacy rows match current retention rules. */
export function sanitizeEventForPrivacy(event) {
  if (!event || typeof event !== 'object') return event
  return {
    ...event,
    referrer: publicReferrer(event.referrer),
    userAgent: publicUserAgent(event.userAgent),
    element: {
      tag: event.element?.tag || '',
      id: event.element?.id || '',
      text: publicClickText(event.element?.text, 48),
    },
  }
}
