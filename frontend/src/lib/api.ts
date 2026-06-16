// Tiny typed wrapper around the .NET API endpoints.
import { apiUrl } from './apiBase'

/** Error carrying the HTTP status, so callers can distinguish auth failures
 *  (401/403) from transient network / 5xx errors. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Broadcast a 401 so the relevant auth context can end the session. The path
 *  lets each context react only to its own domain (admin vs member). */
function notifyUnauthorized(path: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pavillon46:unauthorized', { detail: { path } }))
  }
}

export interface WaitlistSubmitBody {
  firstName: string
  lastName: string
  countryCode: string
  phoneNumber: string
  emailAddress: string
  postalCode: string
  hearAboutKey: string
  hearAboutOther: string
  referralCode?: string
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
  token: string
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
    headers: { Authorization: `Bearer ${params.token}` },
  })
  if (!response.ok) {
    if (response.status === 401) notifyUnauthorized('/api/activity/report')
    throw new ApiError(response.status, `Activity report failed: ${response.status}`)
  }
  return response.json()
}

// ---------------------------------------------------------------------------
// Member area: auth, profile, referrals, events
// ---------------------------------------------------------------------------

export interface MemberDto {
  id: string
  email: string
  title: string
  firstName: string
  lastName: string
  phone: string
  city: string
  country: string
  role: string
  status: string
  referralCode: string
  preferredLanguage: 'fr' | 'en'
  referralCount: number
  successfulReferrals: number
  bonusPoints: number
  mustChangePassword: boolean
  createdAt: string
  lastLoginAt: string
}

export interface LoginResponse {
  token: string
  expiresAt: string
  member: MemberDto
}

export interface AdminDto {
  id: string
  email: string
  title: string
  firstName: string
  lastName: string
  role: string
  mustChangePassword: boolean
  createdAt: string
  lastLoginAt: string
}

export interface AdminLoginResponse {
  token: string
  expiresAt: string
  admin: AdminDto
}

export interface ApplicantDto {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  city: string
  message: string
  referralCode: string
  applicationCode: string
  referrerMemberId: string
  referrerName: string
  referrerEmail: string
  status: 'pending' | 'reviewing' | 'accepted' | 'declined'
  bonusAwarded: boolean
  createdAt: string
}

export interface ReferralResponse {
  applicant: ApplicantDto
  referralCode: string
  applicationCode: string
  shareUrl: string
}

export interface MemberReferralsResponse {
  applicants: ApplicantDto[]
  referralCode: string
  shareUrl: string
  total: number
  pending: number
  accepted: number
  bonusPoints: number
}

export interface AnnouncementDto {
  id: string
  date: string
  tag: string
  title: string
  body: string
}

export interface CreateMemberResponse {
  member: MemberDto
  password: string
  emailSent: boolean
  emailError?: string
}

export interface ProfileUpdateBody {
  firstName?: string
  lastName?: string
  phone?: string
  city?: string
  country?: string
  preferredLanguage?: 'fr' | 'en'
}

export interface ReferralBody {
  firstName: string
  lastName: string
  email: string
  phone: string
  city?: string
  message?: string
  language?: 'fr' | 'en'
}

export interface CreateMemberBody {
  title?: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  city?: string
  country?: string
  contractRef?: string
  notes?: string
  language?: 'fr' | 'en'
  sendEmail: boolean
}

export interface UpdateMemberBody {
  title?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  city?: string
  country?: string
  contractRef?: string
  notes?: string
  language?: 'fr' | 'en'
  status?: string
}

/** Reads a JSON error message from a failed response, falling back to status. */
async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json()
    if (data && typeof data.message === 'string') return data.message
  } catch {
    /* ignore */
  }
  return `Request failed (${response.status})`
}

async function jsonRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!response.ok) {
    if (response.status === 401) notifyUnauthorized(path)
    throw new ApiError(response.status, await readError(response))
  }
  return response.json() as Promise<T>
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

export async function login(email: string, password: string): Promise<LoginResponse> {
  return jsonRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function getMe(token: string): Promise<MemberDto> {
  return jsonRequest<MemberDto>('/api/members/me', { headers: bearer(token) })
}

export async function updateProfile(token: string, body: ProfileUpdateBody): Promise<MemberDto> {
  return jsonRequest<MemberDto>('/api/members/me', {
    method: 'PUT',
    headers: bearer(token),
    body: JSON.stringify(body),
  })
}

export async function changePassword(
  token: string,
  newPassword: string,
  currentPassword?: string,
): Promise<MemberDto> {
  return jsonRequest<MemberDto>('/api/members/me/change-password', {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify({ newPassword, currentPassword }),
  })
}

export async function getMyReferrals(token: string): Promise<MemberReferralsResponse> {
  return jsonRequest<MemberReferralsResponse>('/api/members/me/referrals', { headers: bearer(token) })
}

export async function submitReferral(token: string, body: ReferralBody): Promise<ReferralResponse> {
  return jsonRequest<ReferralResponse>('/api/members/me/referrals', {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify(body),
  })
}

export async function getEvents(token: string, lang: 'fr' | 'en'): Promise<{ announcements: AnnouncementDto[] }> {
  return jsonRequest<{ announcements: AnnouncementDto[] }>(`/api/members/events?lang=${lang}`, {
    headers: bearer(token),
  })
}

// ---------------------------------------------------------------------------
// Admin account auth — a dedicated admin login (email + password), separate
// from members. All admin endpoints below authenticate with the admin's bearer
// token, exactly like the member endpoints.
// ---------------------------------------------------------------------------

export async function adminLogin(email: string, password: string): Promise<AdminLoginResponse> {
  return jsonRequest<AdminLoginResponse>('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function adminGetMe(token: string): Promise<AdminDto> {
  return jsonRequest<AdminDto>('/api/admin/auth/me', { headers: bearer(token) })
}

export async function adminChangePassword(
  token: string,
  newPassword: string,
  currentPassword?: string,
): Promise<AdminDto> {
  return jsonRequest<AdminDto>('/api/admin/auth/change-password', {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify({ newPassword, currentPassword }),
  })
}

// ---- Admin member / referral management — gated by the admin bearer token ----

export async function adminListMembers(token: string): Promise<{ members: MemberDto[]; total: number }> {
  return jsonRequest('/api/admin/members', { headers: bearer(token) })
}

export async function adminCreateMember(token: string, body: CreateMemberBody): Promise<CreateMemberResponse> {
  return jsonRequest<CreateMemberResponse>('/api/admin/members', {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify(body),
  })
}

export async function adminSendCredentials(
  token: string,
  body: { memberId?: string; email?: string; password: string },
): Promise<{ ok: boolean; emailSent: boolean; sentTo?: string }> {
  return jsonRequest('/api/admin/members/send-credentials', {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify(body),
  })
}

export async function adminResetPassword(
  token: string,
  memberId: string,
  sendEmail: boolean,
): Promise<CreateMemberResponse> {
  return jsonRequest<CreateMemberResponse>(
    `/api/admin/members/${encodeURIComponent(memberId)}/reset-password?sendEmail=${sendEmail}`,
    { method: 'POST', headers: bearer(token) },
  )
}

export async function adminUpdateMember(token: string, id: string, body: UpdateMemberBody): Promise<MemberDto> {
  return jsonRequest<MemberDto>(`/api/admin/members/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: bearer(token),
    body: JSON.stringify(body),
  })
}

export async function adminDeleteMember(token: string, id: string): Promise<{ ok: boolean; id: string }> {
  return jsonRequest(`/api/admin/members/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: bearer(token),
  })
}

export interface AdminApplicantsResponse {
  applicants: ApplicantDto[]
  total: number
  pending: number
  accepted: number
  declined: number
}

export async function adminListApplicants(token: string): Promise<AdminApplicantsResponse> {
  return jsonRequest<AdminApplicantsResponse>('/api/admin/applicants', { headers: bearer(token) })
}

export async function adminUpdateApplicant(
  token: string,
  id: string,
  status: ApplicantDto['status'],
): Promise<ApplicantDto> {
  return jsonRequest<ApplicantDto>(`/api/admin/applicants/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: bearer(token),
    body: JSON.stringify({ status }),
  })
}
