import { createHash } from 'crypto'
import { recordActivityEvent } from '../../../lib/activityStore'

const RATE_LIMIT_WINDOW_MS = 15 * 1000
const RATE_LIMIT_MAX_EVENTS = 30
const rateLimitBuckets = new Map()

function isLoggingEnabled() {
  return process.env.ACTIVITY_LOG_ENABLED !== 'false'
}

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for']
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim()
  }
  return req.socket?.remoteAddress || ''
}

function hashIp(ip) {
  const salt = process.env.ACTIVITY_IP_SALT || 'pavillon46-activity'
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex')
}

function getBucketKey(req, sessionId) {
  const ip = getClientIp(req)
  return `${ip}:${sessionId || 'anon'}`
}

function isRateLimited(req, sessionId) {
  const key = getBucketKey(req, sessionId)
  const now = Date.now()
  const existing = rateLimitBuckets.get(key)

  if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(key, { windowStart: now, count: 1 })
    return false
  }

  existing.count += 1
  if (existing.count > RATE_LIMIT_MAX_EVENTS) {
    return true
  }

  return false
}

function normalizeEvent(payload, req) {
  const safePayload = payload && typeof payload === 'object' ? payload : {}
  const rawType = String(safePayload.type || 'page_view')
  const type = rawType === 'click' ? 'click' : 'page_view'
  const path = String(safePayload.path || '/').slice(0, 512)
  const sessionId = String(safePayload.sessionId || '').slice(0, 120)
  const ts = safePayload.ts ? new Date(safePayload.ts).toISOString() : new Date().toISOString()

  const rawElement = safePayload.element && typeof safePayload.element === 'object' ? safePayload.element : {}
  const element = {
    tag: String(rawElement.tag || '').slice(0, 80),
    id: String(rawElement.id || '').slice(0, 120),
    text: String(rawElement.text || '').slice(0, 220),
  }

  return {
    type,
    path,
    sessionId,
    ts,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
    referrer: String(req.headers.referer || '').slice(0, 300),
    ipHash: hashIp(getClientIp(req)),
    element,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  if (!isLoggingEnabled()) {
    return res.status(200).json({ ok: true, skipped: 'disabled' })
  }

  try {
    const event = normalizeEvent(req.body, req)

    if (isRateLimited(req, event.sessionId)) {
      return res.status(429).json({ message: 'Rate limit exceeded' })
    }

    await recordActivityEvent(event)
    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error('Activity log error:', error)
    return res.status(500).json({ message: 'Failed to store activity event' })
  }
}
