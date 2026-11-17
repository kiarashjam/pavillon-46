// Tiny typed wrapper around the .NET API endpoints.
import { apiUrl } from './apiBase'

/** Error carrying the HTTP status, so callers can distinguish auth failures
 *  (401/403) from transient network / 5xx errors. `errorType` is an optional
 *  machine-readable discriminator returned by some endpoints (e.g. reset
 *  password) so callers can localize the message without string-matching. */
export class ApiError extends Error {
  errorType?: string
  constructor(public status: number, message: string, errorType?: string) {
    super(message)
    this.name = 'ApiError'
    this.errorType = errorType
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
  /** Mirrors `MemberDto.NewsletterOptOut` (non-nullable `bool` server-side, so
   *  always present in the payload). True once the member used the unsubscribe
   *  link; the dashboard resubscribe button flips it back to false. */
  newsletterOptOut: boolean
  /** "yyyy-MM-dd", or "" when no start date was recorded. */
  membershipStartDate: string
  /** The start is known to be still undecided ("to be confirmed"). */
  membershipStartUndetermined: boolean
  /** "" for accounts an admin created, "cadence" for ones the CadenceE CRM opened. */
  source: string
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
  status: string
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
  /** "yyyy-MM-dd", or "" to clear it. A date clears "to be confirmed". */
  membershipStartDate?: string
  membershipStartUndetermined?: boolean
}

/** Reads a JSON error body from a failed response, extracting both the
 *  human-readable `message` and an optional machine `errorType`. Falls back to
 *  a synthetic message when the body is not JSON. */
async function readError(response: Response): Promise<{ message: string; errorType?: string }> {
  try {
    const data = await response.json()
    const message =
      data && typeof data.message === 'string'
        ? data.message
        : `Request failed (${response.status})`
    const errorType =
      data && typeof data.errorType === 'string' ? data.errorType : undefined
    return { message, errorType }
  } catch {
    return { message: `Request failed (${response.status})` }
  }
}

async function jsonRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!response.ok) {
    if (response.status === 401) notifyUnauthorized(path)
    const { message, errorType } = await readError(response)
    throw new ApiError(response.status, message, errorType)
  }
  return response.json() as Promise<T>
}

/** Like jsonRequest but for endpoints that answer 204 No Content, where
 *  response.json() would throw on the empty body. Shares the same error and
 *  401-broadcast path so an expired token still ends the session. */
async function emptyRequest(path: string, init: RequestInit): Promise<void> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!response.ok) {
    if (response.status === 401) notifyUnauthorized(path)
    const { message, errorType } = await readError(response)
    throw new ApiError(response.status, message, errorType)
  }
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

export async function login(email: string, password: string): Promise<LoginResponse> {
  return jsonRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function forgotPassword(email: string): Promise<{ ok: boolean }> {
  return jsonRequest<{ ok: boolean }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<{ ok: boolean }> {
  return jsonRequest<{ ok: boolean }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
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

/** Returns a FRESH session (new token + member): changing the password bumps
 *  PasswordVersion server-side, which invalidates the token used to make this
 *  call. Callers must store the returned token or the next request will 401. */
export async function changePassword(
  token: string,
  newPassword: string,
  currentPassword?: string,
): Promise<LoginResponse> {
  return jsonRequest<LoginResponse>('/api/members/me/change-password', {
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

/** Member-facing newsletter row — already localized by the API, so `title` and
 *  `body` reflect the language passed in the query. */
export interface MemberNewsletterDto {
  id: string
  date: string
  tag: string
  title: string
  body: string
  coverImageUrl: string
}

export async function getMemberNewsletters(
  token: string,
  lang: 'fr' | 'en',
): Promise<{ newsletters: MemberNewsletterDto[] }> {
  return jsonRequest<{ newsletters: MemberNewsletterDto[] }>(
    `/api/members/newsletters?lang=${lang}`,
    { headers: bearer(token) },
  )
}

/** Re-subscribe the signed-in member (clears Member.NewsletterOptOut). */
export async function memberOptInNewsletters(token: string): Promise<void> {
  return emptyRequest('/api/members/newsletters/opt-in', {
    method: 'POST',
    headers: bearer(token),
  })
}

/** Unsubscribe from inside the portal, without needing an emailed link. */
export async function memberOptOutNewsletters(token: string): Promise<void> {
  return emptyRequest('/api/members/newsletters/opt-out', {
    method: 'POST',
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
): Promise<AdminLoginResponse> {
  return jsonRequest<AdminLoginResponse>('/api/admin/auth/change-password', {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify({ newPassword, currentPassword }),
  })
}

export async function adminForgotPassword(email: string): Promise<{ ok: boolean }> {
  return jsonRequest<{ ok: boolean }>('/api/admin/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function adminAuthResetPassword(
  token: string,
  newPassword: string,
): Promise<{ ok: boolean }> {
  return jsonRequest<{ ok: boolean }>('/api/admin/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
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

export interface UpdateApplicantBody {
  status?: ApplicantDto['status']
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  city?: string
  message?: string
  referrerMemberId?: string
  referralCode?: string
}

export interface CreateApplicantBody {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  city?: string
  message?: string
  referrerMemberId?: string
  referralCode?: string
  status?: ApplicantDto['status']
  language?: 'fr' | 'en'
}

export async function adminUpdateApplicant(
  token: string,
  id: string,
  statusOrBody: ApplicantDto['status'] | UpdateApplicantBody,
): Promise<ApplicantDto> {
  const body = typeof statusOrBody === 'string' ? { status: statusOrBody } : statusOrBody
  return jsonRequest<ApplicantDto>(`/api/admin/applicants/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: bearer(token),
    body: JSON.stringify(body),
  })
}

export async function adminCreateApplicant(token: string, body: CreateApplicantBody): Promise<ApplicantDto> {
  return jsonRequest<ApplicantDto>('/api/admin/applicants', {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify(body),
  })
}

export async function adminDeleteApplicant(token: string, id: string): Promise<{ ok: boolean; id: string }> {
  return jsonRequest(`/api/admin/applicants/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: bearer(token),
  })
}

export interface CreateAdminBody {
  title?: string
  firstName: string
  lastName: string
  email: string
  sendEmail: boolean
}

export interface UpdateAdminBody {
  title?: string
  firstName?: string
  lastName?: string
  email?: string
  status?: string
}

export interface CreateAdminResponse {
  admin: AdminDto
  password: string
  emailSent: boolean
  emailError?: string
}

export interface AdminAdminsResponse {
  admins: AdminDto[]
  total: number
  active: number
}

export async function adminListAdmins(token: string): Promise<AdminAdminsResponse> {
  return jsonRequest<AdminAdminsResponse>('/api/admin/admins', { headers: bearer(token) })
}

export async function adminCreateAdmin(token: string, body: CreateAdminBody): Promise<CreateAdminResponse> {
  return jsonRequest<CreateAdminResponse>('/api/admin/admins', {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify(body),
  })
}

export async function adminUpdateAdmin(token: string, id: string, body: UpdateAdminBody): Promise<AdminDto> {
  return jsonRequest<AdminDto>(`/api/admin/admins/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: bearer(token),
    body: JSON.stringify(body),
  })
}

export async function adminDeleteAdmin(token: string, id: string): Promise<{ ok: boolean; id: string }> {
  return jsonRequest(`/api/admin/admins/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: bearer(token),
  })
}

export async function adminResetAdminPassword(
  token: string,
  id: string,
  sendEmail: boolean,
): Promise<CreateAdminResponse> {
  return jsonRequest<CreateAdminResponse>(
    `/api/admin/admins/${encodeURIComponent(id)}/reset-password?sendEmail=${sendEmail}`,
    { method: 'POST', headers: bearer(token) },
  )
}

// ---------------------------------------------------------------------------
// Admin newsletters — the editorial module. Every endpoint is gated by the
// admin bearer token, mirroring the admin/members surface.
// ---------------------------------------------------------------------------

/** A **persisted** audit row, as it hangs off `NewsletterDto.lastSend`,
 *  `lastTestSend` and `sendHistory` (server: `Models.NewsletterSendAudit`).
 *
 *  `failedRecipients` here holds **member ids**, capped at 200 — the uncapped
 *  address list is `[JsonIgnore]` server-side and never reaches a stored audit.
 *  `failedTotal` is the true count when the id list was capped. For the
 *  response of a send you just triggered, see {@link NewsletterSendResultDto},
 *  which is the only place `failedRecipients` carries real addresses. */
export interface NewsletterSendAuditDto {
  sentAt: string
  adminId: string
  totalRecipients: number
  sent: number
  failed: number
  /** True number of failures; `failedRecipients` may have been capped. */
  failedTotal: number
  batches: number
  testMode: boolean
  /** `'send' | 'test' | 'resend'` — widened to `string` so an unknown kind from
   *  a newer server does not become a type error in old clients. */
  kind: string
  /** Member ids (legacy rows may still hold addresses), capped at 200. */
  failedRecipients: string[]
  errors: string[]
}

/** The 200 body of `POST /{id}/send` and `POST /{id}/resend-failed`
 *  (server: `Models.SendAuditDto`).
 *
 *  A fully-failed send is **200, not 502**: a non-2xx from these two endpoints
 *  means the request itself was refused (validation, a 409 claim, an
 *  unconfigured sender), never "the mail did not go out". Read `ok` / `outcome`
 *  to tell what happened to the mail.
 *
 *  Unlike the persisted {@link NewsletterSendAuditDto}, `failedRecipients` on
 *  this DTO carries the real **email addresses** for the request you just made
 *  and is uncapped; `failedRecipientIds` is the capped, persisted id list — the
 *  set `/resend-failed` will actually retry, so size a "resend to N" affordance
 *  off that array, never off `failedRecipients`. */
export interface NewsletterSendResultDto extends NewsletterSendAuditDto {
  newsletterId: string
  /** `failed === 0`. */
  ok: boolean
  outcome: 'sent' | 'partial' | 'all_failed'
  /** Email addresses for this request, uncapped. */
  failedRecipients: string[]
  /** Persisted member ids — what `/resend-failed` acts on. */
  failedRecipientIds: string[]
}

export interface NewsletterDto {
  id: string
  titleFr: string
  titleEn: string
  bodyFr: string
  bodyEn: string
  tag: string
  coverImageUrl: string
  coverImageKeyword: string
  status: 'draft' | 'published' | 'sent'
  createdByAdminId: string
  createdAt: string
  updatedAt: string
  publishedAt?: string | null
  lastSentAt?: string | null
  aiDrafted: boolean
  sourceBrief: string
  lastSend?: NewsletterSendAuditDto | null
  /** The last **test** send, kept apart from `lastSend` so a test can never
   *  overwrite the record of what members actually received. */
  lastTestSend?: NewsletterSendAuditDto | null
  /** Most recent real sends/resends, newest first, capped at 10 server-side.
   *  Populated on the detail read only — the list endpoint omits it. */
  sendHistory?: NewsletterSendAuditDto[] | null
  /** Set while a send is in flight; a second send is refused with 409
   *  `send_already_in_progress`. Lets the UI grey its Send button out instead
   *  of discovering the conflict the hard way. */
  sendClaimedAtUtc?: string | null
  /** The `From:` address members will actually see, resolved server-side from
   *  the SendGrid config (env-only, so the browser cannot work it out). Present
   *  on the **detail** read; empty on list rows. Show it in the send
   *  confirmation rather than hard-coding an address. */
  senderAddress?: string
  /** Number of active, non-opt-out members with an email — the audience a send
   *  would actually reach. Computed server-side in AdminNewslettersController
   *  and serialized as a non-nullable `int`, so clients should use this rather
   *  than recounting `/api/admin/members` themselves. */
  audienceCount: number
}

export interface AdminNewslettersResponse {
  newsletters: NewsletterDto[]
  total: number
  drafts: number
  published: number
  sent: number
}

export interface CreateNewsletterBody {
  titleFr: string
  titleEn: string
  bodyFr: string
  bodyEn: string
  tag: string
  coverImageUrl?: string
  coverImageKeyword?: string
  sourceBrief?: string
  aiDrafted?: boolean
}

export type UpdateNewsletterBody = Partial<CreateNewsletterBody>

export interface AiDraftBody {
  brief: string
  tone?: string
}

export interface AiDraftResponse {
  titleFr: string
  titleEn: string
  bodyFr: string
  bodyEn: string
  tag: string
  coverImageKeyword: string
  /** Empty unless `coverImageAutoResolved` — the server never invents a URL. */
  coverImageUrl: string
  /** True only when `coverImageUrl` is a real photo the server resolved from
   *  Unsplash. False means the URL is empty *by design*: show a "search for
   *  «keyword»" state, not a broken image. */
  coverImageAutoResolved: boolean
  /** Why: `resolved` | `no_api_key` | `no_match` | `lookup_failed` |
   *  `no_keyword`. Phrase this in FR/EN in the UI. */
  coverImageStatus: string
  /** English fallback sentence for the same thing, safe to display as-is. */
  coverImageNote: string
  /** Unsplash's terms require crediting the photographer wherever the photo is
   *  shown. Both are empty unless the cover resolved. */
  coverImagePhotographer: string
  coverImagePhotographerUrl: string
}

export interface SendNewsletterBody {
  testEmails?: string[]
}

export async function adminListNewsletters(token: string): Promise<AdminNewslettersResponse> {
  return jsonRequest<AdminNewslettersResponse>('/api/admin/newsletters', { headers: bearer(token) })
}

export async function adminGetNewsletter(token: string, id: string): Promise<NewsletterDto> {
  return jsonRequest<NewsletterDto>(`/api/admin/newsletters/${encodeURIComponent(id)}`, {
    headers: bearer(token),
  })
}

export async function adminCreateNewsletter(
  token: string,
  body: CreateNewsletterBody,
): Promise<NewsletterDto> {
  return jsonRequest<NewsletterDto>('/api/admin/newsletters', {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify(body),
  })
}

export async function adminUpdateNewsletter(
  token: string,
  id: string,
  body: UpdateNewsletterBody,
): Promise<NewsletterDto> {
  return jsonRequest<NewsletterDto>(`/api/admin/newsletters/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: bearer(token),
    body: JSON.stringify(body),
  })
}

export async function adminDeleteNewsletter(
  token: string,
  id: string,
): Promise<{ ok: boolean; id: string }> {
  return jsonRequest(`/api/admin/newsletters/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: bearer(token),
  })
}

export async function adminPublishNewsletter(token: string, id: string): Promise<NewsletterDto> {
  return jsonRequest<NewsletterDto>(
    `/api/admin/newsletters/${encodeURIComponent(id)}/publish`,
    { method: 'POST', headers: bearer(token) },
  )
}

export async function adminUnpublishNewsletter(token: string, id: string): Promise<NewsletterDto> {
  return jsonRequest<NewsletterDto>(
    `/api/admin/newsletters/${encodeURIComponent(id)}/unpublish`,
    { method: 'POST', headers: bearer(token) },
  )
}

/** Send a newsletter. Omit `testEmails` entirely for a real send to every
 *  active, subscribed member; supply it for a test send.
 *
 *  Do **not** send `{ testEmails: [] }` or `{ testEmails: [''] }`: a field that
 *  is present at all reads as intent to test, and the server answers 400
 *  `no_valid_test_recipients` rather than mailing the whole membership. That
 *  refusal is the fix for a bug where a blank test address mailed everyone.
 *
 *  Resolves 200 even when every message failed — check `outcome` on the result.
 *  Rejects with {@link ApiError} for request-level refusals, whose `errorType`
 *  is one of `no_valid_test_recipients` / `too_many_test_recipients` (400),
 *  `send_already_in_progress` (409, a send is already running),
 *  `newsletter_not_published` (409 — note the prefix: the *unpublish* endpoint
 *  spells its own conflict `not_published`), or `sender_not_configured` (500). */
export async function adminSendNewsletter(
  token: string,
  id: string,
  body: SendNewsletterBody = {},
): Promise<NewsletterSendResultDto> {
  return jsonRequest<NewsletterSendResultDto>(
    `/api/admin/newsletters/${encodeURIComponent(id)}/send`,
    {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify(body),
    },
  )
}

/** Retry only the recipients the most recent **real** send recorded as failed.
 *  Members who already received the issue are never re-mailed: they are not in
 *  the stored failed list. The list is re-filtered through the same
 *  active/subscribed/valid-address gate, so someone who has since unsubscribed
 *  is skipped.
 *
 *  Same 200-with-audit contract as {@link adminSendNewsletter}. Rejects with
 *  `errorType` `no_prior_send`, `nothing_to_resend` or
 *  `send_already_in_progress` (all 409). */
export async function adminResendFailedNewsletter(
  token: string,
  id: string,
): Promise<NewsletterSendResultDto> {
  return jsonRequest<NewsletterSendResultDto>(
    `/api/admin/newsletters/${encodeURIComponent(id)}/resend-failed`,
    { method: 'POST', headers: bearer(token) },
  )
}

export async function adminDraftNewsletterWithAi(
  token: string,
  body: AiDraftBody,
): Promise<AiDraftResponse> {
  return jsonRequest<AiDraftResponse>('/api/admin/newsletters/draft-ai', {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Meetings: the public booking page (/rendez-vous, /en/meeting) and the admin
// Meetings section. Dates are "YYYY-MM-DD" and times "HH:mm", both wall-clock
// Europe/Zurich, whatever the visitor's own time zone.
// ---------------------------------------------------------------------------

export type MeetingDayStatus = 'open' | 'full' | 'closed'

export interface MeetingAvailabilityDay {
  date: string
  status: MeetingDayStatus
  /** Free start times, only for an "open" day. */
  slots: string[]
}

export interface MeetingAvailabilityDto {
  timeZone: string
  slotMinutes: number
  /** Today in Zurich. */
  today: string
  /** The last bookable day (today + the booking horizon). */
  lastDate: string
  days: MeetingAvailabilityDay[]
}

export interface MeetingInviteDto {
  valid: boolean
  firstName?: string
  lastName?: string
  email?: string
  code?: string
}

export interface MeetingBookingBody {
  date: string
  time: string
  firstName: string
  lastName: string
  email: string
  phone: string
  message: string
  language: 'fr' | 'en'
  /** The `?invite=` token from a CadenceE invitation, when there is one. */
  invite?: string
}

export interface MeetingBookingResponse {
  id: string
  date: string
  time: string
  durationMinutes: number
  /** ISO 8601 with the Zurich offset, e.g. "2026-11-20T10:00:00+01:00". */
  startsAt: string
}

/** At most 92 days per call (`errorType: "invalid_range"` beyond). */
export async function getMeetingAvailability(from: string, to: string): Promise<MeetingAvailabilityDto> {
  const search = new URLSearchParams({ from, to })
  return jsonRequest<MeetingAvailabilityDto>(`/api/meetings/availability?${search.toString()}`, {})
}

/** Always resolves `{ valid: false }` for a forged, expired or unknown token. */
export async function getMeetingInvite(token: string): Promise<MeetingInviteDto> {
  const search = new URLSearchParams({ token })
  return jsonRequest<MeetingInviteDto>(`/api/meetings/invite?${search.toString()}`, {})
}

/** Rejects with {@link ApiError}: 409 `slot_unavailable` when the time was
 *  just taken (or is no longer bookable), 400 `invalid_booking` with the
 *  message for a field, 429 `rate_limited`. */
export async function bookMeeting(body: MeetingBookingBody): Promise<MeetingBookingResponse> {
  return jsonRequest<MeetingBookingResponse>('/api/meetings/bookings', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export interface MeetingWeekdayDto {
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  day: number
  open: boolean
  from: string
  to: string
}

export interface MeetingSettingsDto {
  timeZone: string
  slotMinutes: number
  weekdays: MeetingWeekdayDto[]
  minNoticeHours: number
  horizonDays: number
  notifyEmails: string[]
  updatedAt?: string
}

export type UpdateMeetingSettingsBody = Partial<
  Pick<MeetingSettingsDto, 'slotMinutes' | 'weekdays' | 'minNoticeHours' | 'horizonDays' | 'notifyEmails'>
>

export interface AdminMeetingDayDto {
  date: string
  /** What the public sees now. */
  status: MeetingDayStatus
  /** What the team set: the date's override, else its weekday rule. */
  configured: MeetingDayStatus
  source: 'weekday' | 'override'
  weekdayOpen: boolean
  from: string
  to: string
  slots: number
  free: number
  bookings: number
}

export interface AdminMeetingDaysResponse {
  timeZone: string
  today: string
  /** The last bookable day (today + the booking horizon). */
  lastDate: string
  days: AdminMeetingDayDto[]
}

export interface MeetingBookingDto {
  id: string
  date: string
  time: string
  durationMinutes: number
  startsAt: string
  firstName: string
  lastName: string
  email: string
  phone: string
  message: string
  language: 'fr' | 'en'
  crmLeadId: string
  crmOrganizationId: string
  code: string
  status: 'booked' | 'cancelled'
  createdAt: string
  cancelledAt?: string
  crm: MeetingCrmStateDto
}

/** Where a booking goes in CadenceE, and whether it got there. */
export interface MeetingCrmStateDto {
  /** `invitation`: posted to the CRM that sent the invitation; `cadence`: a
   *  walk-in posted to the CRM; `leads-webhook`: a walk-in sent as a new lead;
   *  `none`: nothing to send. */
  channel: 'invitation' | 'cadence' | 'leads-webhook' | 'none'
  /** CadenceE does not have the booking's current status yet. */
  pending: boolean
  /** CadenceE refused it: no automatic resend until "Send again". */
  halted: boolean
  syncedAt?: string
  lastError?: string
  nextAttemptAt?: string
}

export interface AdminMeetingBookingsResponse {
  /** Upcoming first (soonest at the top), then past ones, most recent first. */
  bookings: MeetingBookingDto[]
  total: number
  upcoming: number
  /** Bookings CadenceE does not have up to date yet. */
  notInCrm: number
}

export async function adminGetMeetingSettings(token: string): Promise<MeetingSettingsDto> {
  return jsonRequest<MeetingSettingsDto>('/api/admin/meetings/settings', { headers: bearer(token) })
}

export async function adminUpdateMeetingSettings(
  token: string,
  body: UpdateMeetingSettingsBody,
): Promise<MeetingSettingsDto> {
  return jsonRequest<MeetingSettingsDto>('/api/admin/meetings/settings', {
    method: 'PUT',
    headers: bearer(token),
    body: JSON.stringify(body),
  })
}

export async function adminListMeetingDays(
  token: string,
  from: string,
  to: string,
): Promise<AdminMeetingDaysResponse> {
  const search = new URLSearchParams({ from, to })
  return jsonRequest<AdminMeetingDaysResponse>(`/api/admin/meetings/days?${search.toString()}`, {
    headers: bearer(token),
  })
}

/** `default` removes the date's override, so it follows its weekday again. */
export async function adminSetMeetingDay(
  token: string,
  date: string,
  status: MeetingDayStatus | 'default',
): Promise<AdminMeetingDayDto> {
  return jsonRequest<AdminMeetingDayDto>(`/api/admin/meetings/days/${encodeURIComponent(date)}`, {
    method: 'PUT',
    headers: bearer(token),
    body: JSON.stringify({ status }),
  })
}

export async function adminListMeetingBookings(
  token: string,
  params: { from?: string; to?: string; status?: 'all' | 'booked' | 'cancelled' } = {},
): Promise<AdminMeetingBookingsResponse> {
  const search = new URLSearchParams()
  if (params.from) search.set('from', params.from)
  if (params.to) search.set('to', params.to)
  if (params.status) search.set('status', params.status)
  const qs = search.toString()
  return jsonRequest<AdminMeetingBookingsResponse>(`/api/admin/meetings/bookings${qs ? `?${qs}` : ''}`, {
    headers: bearer(token),
  })
}

/** "Send again": one attempt now to bring CadenceE up to date with a booking,
 *  even after a refusal. `synced` says whether it worked; the booking's `crm`
 *  carries the reason when it did not. */
export async function adminResendMeetingBooking(
  token: string,
  id: string,
): Promise<{ booking: MeetingBookingDto; synced: boolean }> {
  return jsonRequest(`/api/admin/meetings/bookings/${encodeURIComponent(id)}/resend`, {
    method: 'POST',
    headers: bearer(token),
  })
}

/** Frees the slot and emails the person a short note (`emailed` says whether
 *  it went). Rejects with 409 `already_cancelled` or 404 `not_found`. */
export async function adminCancelMeetingBooking(
  token: string,
  id: string,
): Promise<{ booking: MeetingBookingDto; emailed: boolean }> {
  return jsonRequest(`/api/admin/meetings/bookings/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    headers: bearer(token),
  })
}
