// Tiny typed wrapper around the .NET API endpoints.
import { apiUrl } from './apiBase'

export interface WaitlistSubmitBody {
  firstName: string
  lastName: string
  countryCode: string
  phoneNumber: string
  emailAddress: string
  postalCode: string
  hearAboutKey: string
  hearAboutOther: string
  language: 'fr' | 'en'
}

export async function sendVerification(countryCode: string, phoneNumber: string) {
  return fetch(apiUrl('/api/send-verification'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ countryCode, phoneNumber }),
  })
}

export async function verifyCode(countryCode: string, phoneNumber: string, code: string) {
  return fetch(apiUrl('/api/verify-code'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ countryCode, phoneNumber, code }),
  })
}

export async function submitWaitlist(body: WaitlistSubmitBody) {
  return fetch(apiUrl('/api/send-email'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export interface ActivityEventDto {
  id: string
  type: string
  path: string
  ts: string
  sessionId: string
  userAgent: string
  referrer: string
  ipHash: string
  element: { tag: string; id: string; text: string }
}

export interface ActivityReportDto {
  events: ActivityEventDto[]
  summary: {
    totalEvents: number
    pageViews: number
    clicks: number
    uniqueSessions: number
    topPages: Array<{ path: string; count: number }>
    topClicks: Array<{ label: string; count: number }>
  }
  meta: {
    scannedEvents: number
    maxScan: number | null
    truncated: boolean
    latestEventTs: string | null
    oldestEventTs: string | null
  }
  storage: string
}

export async function fetchActivityReport(params: {
  key: string
  from?: string
  to?: string
  type?: string
  path?: string
  limit?: number
}): Promise<ActivityReportDto> {
  const search = new URLSearchParams()
  if (params.from) search.set('from', params.from)
  if (params.to) search.set('to', params.to)
  if (params.type) search.set('type', params.type)
  if (params.path) search.set('path', params.path)
  if (params.limit) search.set('limit', String(params.limit))

  const response = await fetch(apiUrl(`/api/activity/report?${search.toString()}`), {
    headers: { 'x-report-key': params.key },
  })
  if (!response.ok) {
    throw new Error(`Activity report failed: ${response.status}`)
  }
  return response.json()
}
