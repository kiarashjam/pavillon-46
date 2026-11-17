# Pavillon 46 – Backend (.NET 8 ASP.NET Core Web API)

This is the ASP.NET Core 8 backend that powers the Pavillon 46 site. It replaces the original
Next.js API routes (`/pages/api/*`) and exposes the same endpoints under `/api/*`.

## Endpoints

Auth column: **public** — anyone; **member** — `Authorization: Bearer <member token>`;
**admin** — `Authorization: Bearer <admin token>`. Errors are JSON `{ "message", "errorType"? }`.
Conventions for adding endpoints are in [`AGENTS.md`](./AGENTS.md).

### Public site and waitlist

| Verb | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/send-verification` | public | Send a Twilio Verify SMS code |
| `POST` | `/api/verify-code` | public | Check the SMS code |
| `POST` | `/api/send-email` | public | Waitlist submission → admin notification, applicant confirmation, ACI lead webhook |
| `POST` | `/api/activity/log` | public | Page views and clicks from the activity tracker (rate-limited; IP hashed) |
| `GET` | `/api/activity/report` | admin or report key | Activity report. Accepts an admin token, or the `x-report-key` header matching `ACTIVITY_REPORT_KEY` |
| `GET` `POST` | `/api/activity/daily-report` | admin or report key | Email the daily activity summary (called by the cron workflow) |
| `GET` | `/healthz` | public | Health check |

### Member sign-in

| Verb | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | public | Sign in → session token |
| `POST` | `/api/auth/forgot-password` | public | Email a reset link. Always `200 { ok: true }`, whether or not the account exists |
| `POST` | `/api/auth/reset-password` | public | Set a new password from a reset token (no session returned) |

### Member portal

| Verb | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/members/me` | member | Current member |
| `PUT` | `/api/members/me` | member | Update profile |
| `POST` | `/api/members/me/change-password` | member | Change password → returns a fresh session; older tokens stop working |
| `GET` | `/api/members/me/referrals` | member | The member's referrals |
| `POST` | `/api/members/me/referrals` | member | Refer someone (creates an applicant) |
| `GET` | `/api/members/events?lang=` | member | Announcements: seeded items plus published newsletters, localised |
| `GET` | `/api/members/newsletters` | member | Published and sent newsletters, newest first, localised |
| `POST` | `/api/members/newsletters/opt-in` | member | Receive newsletter emails again |
| `POST` | `/api/members/newsletters/opt-out` | member | Stop receiving newsletter emails |
| `GET` | `/api/newsletters/unsubscribe?t=&lang=` | public (signed link) | One-click unsubscribe from an email. Always `200` with an HTML page |

### Admin sign-in

| Verb | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/admin/auth/login` | public | Sign in → admin session token |
| `GET` | `/api/admin/auth/me` | admin | Current admin |
| `POST` | `/api/admin/auth/change-password` | admin | Change password → returns a fresh session |
| `POST` | `/api/admin/auth/forgot-password` | public | Email a reset link. Unknown emails get `400` with `errorType: "not_admin"` |
| `POST` | `/api/admin/auth/reset-password` | public | Set a new password from a reset token |

### Admin console

| Verb | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/admins` | admin | List admin accounts |
| `POST` | `/api/admin/admins` | admin | Create an admin (returns a one-time password) |
| `PUT` | `/api/admin/admins/{id}` | admin | Edit an admin (name, email, status) |
| `DELETE` | `/api/admin/admins/{id}` | admin | Delete an admin (not yourself, not the last active one) |
| `POST` | `/api/admin/admins/{id}/reset-password` | admin | Reset another admin's password; signs them out |
| `GET` | `/api/admin/members` | admin | List members |
| `POST` | `/api/admin/members` | admin | Create a member (returns a generated password, optionally emails it) |
| `POST` | `/api/admin/members/send-credentials` | admin | Email a member their sign-in credentials |
| `PUT` | `/api/admin/members/{id}` | admin | Edit a member |
| `DELETE` | `/api/admin/members/{id}` | admin | Delete a member |
| `POST` | `/api/admin/members/{id}/reset-password` | admin | Reset a member's password; signs them out |
| `GET` | `/api/admin/applicants` | admin | List waitlist submitters and referrals |
| `POST` | `/api/admin/applicants` | admin | Add a submitter by hand |
| `PATCH` | `/api/admin/applicants/{id}` | admin | Edit a submitter's details or status |
| `DELETE` | `/api/admin/applicants/{id}` | admin | Delete a submitter |

### CadenceE CRM

| Verb | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/integrations/cadence/onboarding` | HMAC signature | The CRM hands over a member when a deal is won: opens (or finds) the account, emails a set-password link, reports back. `503 not_configured` without `CADENCE_ONBOARDING_SECRET` |

**The handoff contract.** The CRM posts `{ eventName, payload, sentAtUtc, id, organizationId,
occurredAtUtc }` with these headers:

- `X-Cadence-Timestamp` — Unix seconds.
- `X-Cadence-Signature-256: sha256=<hex>` — HMAC-SHA256, with `CADENCE_ONBOARDING_SECRET`, of
  `"{timestamp}.{raw body}"`. Checked over the raw bytes, in constant time, before anything is
  parsed. A missing or wrong signature, or a timestamp more than
  `CADENCE_SIGNATURE_TOLERANCE_SECONDS` from now, answers `401` with no detail. (The CRM also sends
  a legacy `X-Cadence-Signature` over the body alone; it is ignored here.)

Events:

- `onboarding.ping` — the CRM's "Send a test". Answers `200 { ok: true, from: { name, email } }`
  (who welcomes go out from by default, `FROM_NAME`/`FROM_EMAIL`; `from` is null without them) and
  does nothing else.
- `deal.onboarding` — `payload` is `{ version: 1, onboardingId, deal { id, name, … }, contact {
  name, firstName, lastName, email, phone, … }, membership { startsOn: "yyyy-MM-dd" | null,
  startUndetermined }, language: "fr" | "en", welcomeMessage, email { subject, html } | null,
  callback { url, token }, from { name, email, replyTo } | null, … }`.
- Anything else answers `200 { ok: true, ignored: true }`, so the CRM does not retry it.

What a `deal.onboarding` does (`CadenceOnboardingService`):

1. **Once per event id.** The envelope's `id` is the same on every retry. A repeat answers the
   recorded result and sends nothing (`CadenceEvents` table, kept 30 days).
2. **The account.** Found by email, or created with `source: "cadence"`, the payload's language,
   and a random password nobody knows — no password is made up for the member or emailed. An
   existing account keeps its password and language; a suspended or inactive one is left alone
   and reported as `failed`. Either way the membership start (a date, or "to be confirmed") and
   the CRM's ids are stored on the member.
3. **The link.** A set-password link through the reset-token store (single-use, hash-only, older
   links burned), valid `CADENCE_WELCOME_LINK_TTL_HOURS`, to `/reset-password?token=…&welcome=1`.
4. **The email**, through SendGrid. With `email.html`, the organisation's own design: the portal
   fills `{{setPasswordUrl}}`, `{{portalUrl}}`, `{{loginEmail}}` and the member's `{{referralCode}}`
   (HTML-encoded; `{{key|fallback}}` works, and any placeholder it does not know becomes its fallback
   or nothing), then the whole of it goes through an allow-list sanitiser (`CadenceEmailTemplate`: no
   script, iframe, form or event handler, links only http/https/mailto, images only https, no
   `<style>` block). Without it, Pavillon's own bilingual welcome email. The plain-text part is
   always ours. **Who it is from** (`EmailService.WelcomeSender`): the organisation's `from.name`
   (one line, at most 100 characters; else `FROM_NAME`) and its `from.replyTo` as Reply-To. Its
   `from.email` only when it is on the same domain as `FROM_EMAIL`, which SendGrid is set up to
   send for; any other domain would be refused or fail the recipient's DMARC check, so the email
   goes from `FROM_EMAIL` under the organisation's name, with that address as Reply-To instead.
   A ready design for Founding Members, built on these placeholders and on inline styles only, is in
   `docs/cadence/founders-letter.en.html`: paste it into CadenceE's Settings › Welcome & portal.
5. **The answer:** `200 { accountId, status: "created" | "existing" }`. A handoff that can never be
   valid (no email, an unknown version) answers `200 { status: "rejected", message }` and is
   reported as `failed`, so the CRM stops retrying it; without a callback it answers `400`.
6. **Reports back** (`CadenceReporter`, in the background, after the answer): `POST callback.url`
   with `Authorization: Bearer <callback.token>` and `{ event, accountId, message, occurredAtUtc }`
   — `account_created` or `account_existing`, then `email_sent` (its `message` says who it went
   from: "Sent from Name <address>, replies to …") or `email_failed`; and later, once,
   `password_set` when the member sets their password through the link (or any reset). Retried 4
   times with backoff on network errors, `408`, `429` and `5xx`. The callback must be `https`
   (plain `http` is accepted in Development only); the token is stored on the member, never
   returned by any endpoint and never logged.

### Meetings

The booking page (`/rendez-vous`, `/en/meeting`) and the admin console's Meetings section. Every
date is `yyyy-MM-dd` and every time `HH:mm`, wall-clock **Europe/Zurich**.

| Verb | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/meetings/availability?from=&to=` | public | Free slots per day, at most 92 days per call |
| `GET` | `/api/meetings/invite?token=` | public | Checks a CadenceE invitation token. 60 per minute per IP |
| `POST` | `/api/meetings/bookings` | public | Books a slot. 10 per 15 minutes per IP, 5 per hour per email |
| `GET` | `/api/admin/meetings/settings` | admin | Slot length, weekly hours, notice, horizon, notification addresses |
| `PUT` | `/api/admin/meetings/settings` | admin | Change any of them (fields left out are kept) |
| `GET` | `/api/admin/meetings/days?from=&to=` | admin | Each date as the team set it and as the public sees it, with bookings and free slots |
| `PUT` | `/api/admin/meetings/days/{date}` | admin | `{ status: "open" \| "full" \| "closed" \| "default" }` for one date |
| `GET` | `/api/admin/meetings/bookings?from=&to=&status=` | admin | Bookings, upcoming first (soonest at the top), then past ones; `status` is `all` (default), `booked` or `cancelled` |
| `POST` | `/api/admin/meetings/bookings/{id}/cancel` | admin | Cancels: frees the slot, emails the person, tells the CRM. `409 already_cancelled`, `404 not_found` |
| `POST` | `/api/admin/meetings/bookings/{id}/resend` | admin | "Send again": one attempt now to bring CadenceE up to date with the booking, even after a refusal → `{ booking, synced }` |

**The rules** (`MeetingCalendar`). Settings default to 45-minute slots, Monday to Friday 10:00–18:00
(Saturday and Sunday closed, their hours kept), 24 hours' notice, 60 days ahead. A day's slots start
at its opening time, every slot length, as long as the slot ends by closing time. A date can be set
apart: `open` opens it with its weekday's hours (a single Saturday, say), `full` shows it as full,
`closed` closes it; `default`, or the status its weekday already has, removes the override. The
public status of a date is `closed` when it is past, beyond the horizon, closed, has no slot in its
hours, or every slot starts inside the minimum notice; `full` when the team set it full or every
bookable slot is taken; `open` otherwise. A slot is taken when any booking overlaps it, so bookings
made before a change of slot length still block their time. Daylight saving: a start time the
spring-forward skips (02:00–02:59 on the last Sunday of March) is never a slot; one the autumn
fall-back repeats is always its first occurrence, summer time (`+02:00`); `startsAt` is always a
full date and time with its offset.

`GET /api/meetings/availability` answers `{ timeZone: "Europe/Zurich", slotMinutes, today,
lastDate, days: [ { date, status: "open" | "full" | "closed", slots: ["10:00", …] } ] }` — `slots`
are the free ones only; `today` and `lastDate` (the last bookable day) are in Zurich.
`400 invalid_range` for a missing, reversed or longer than 92-day range.

`POST /api/meetings/bookings` takes `{ date, time, firstName, lastName, email, phone, message,
language: "fr" | "en", invite }` (`message` and `invite` optional) and answers `200 { id, date, time,
durationMinutes, startsAt }`, `startsAt` being ISO 8601 with the Zurich offset
(`2026-11-20T10:00:00+01:00`). `409 slot_unavailable` when the slot is not, or no longer, free
(checked and saved under one lock); `400 invalid_booking` with `field` for invalid input; `429
rate_limited`. With a valid invitation the booking is linked to its lead and uses the invitation's
email address. After it is saved, nothing can fail it: the team (the notification addresses) gets a
"Nouveau rendez-vous" email, the person a confirmation in their language, and the CRM is told in the
background (below).

**The invitation token** (`MeetingInviteService`) — the CRM emails a lead
`{bookingPageUrl}?invite={token}`, where `token` is `base64url(UTF-8 JSON payload) + "." +
base64url(HMAC-SHA256(key = UTF-8 bytes of CADENCE_ONBOARDING_SECRET, data = ASCII bytes of the
first part))`, base64url being RFC 4648 §5 without padding. The payload is `{ "v": 1, "o":
"<organization id>", "l": "<lead id>", "n": "<full name>", "e": "<email>", "c": "<booking code,
e.g. RDV-7K2Q>", "u": "<CRM public API base URL>", "x": <expiry, Unix seconds> }`. The MAC is
compared in constant time before the payload is read; `v` must be 1 and `x` in the future; the name
splits into first word / rest. Without the secret no token is valid. `GET /api/meetings/invite`
answers `{ valid: true, firstName, lastName, email, code }` or `{ valid: false }`. A booking whose
token is invalid or expired goes through as a direct booking.

**Telling the CRM** (`MeetingCrmNotifier`). Every booking, and every cancellation, is reported to
CadenceE in the background once it is saved:

- **From a valid invitation** — `POST {u}/api/public/meetings`, `u` being the CRM URL the invitation
  carried.
- **A walk-in** (no valid invitation), when `CADENCE_ORGANIZATION_ID` and `CADENCE_CRM_URL` are set
  — `POST {CADENCE_CRM_URL}/api/public/meetings`, with `organizationId` from the setting and
  `leadId` and `code` null; the CRM finds the lead by email or creates one with source
  "Rendez-vous pavillon46.ch".
- **A walk-in otherwise** — a new lead through the leads webhook (`LEADS_WEBHOOK_URL` with
  `LEADS_WEBHOOK_API_KEY`), `source: "Rendez-vous pavillon46.ch"`. The webhook has no place for
  the time, the message or a cancellation, which is why the two settings above are preferred.

The posts carry `X-Cadence-Timestamp` (Unix seconds) and `X-Cadence-Signature-256:
sha256=<lowercase hex HMAC-SHA256(CADENCE_ONBOARDING_SECRET, "{timestamp}.{raw body}")>` — the
scheme the CRM uses for its handoffs here — re-signed on every attempt. The body is `{
"organizationId", "leadId", "code", "bookingId", "firstName", "lastName", "email", "phone",
"message", "startsAt": "2026-11-20T10:00:00+01:00", "durationMinutes", "language", "status":
"booked" | "cancelled" }`, always the booking's current status (a booking cancelled before the CRM
heard of it is sent once, as cancelled). Both CRM URLs must be `https` (plain `http` in
Development only), with no query, fragment or user info.

**Nothing is lost.** What the CRM acknowledged (`2xx`) is recorded on the booking
(`CrmSyncedStatus`, `CrmSyncedAt`), so the state survives a restart. A post that fails is tried
again at once, after 2 s, 10 s and 1 min; then a sweep — at startup and every 3 minutes — resends
every booking changed in the last 7 days that CadenceE does not have yet, waiting 5 minutes,
doubling to at most 6 hours between rounds. A refusal (`4xx` other than `408`/`429`: a wrong
secret, an unknown workspace or address, a body it will never take) stops the automatic resends:
those need a fix, not a retry. The admin console marks such bookings "Not yet in CadenceE" (or
"Refused by CadenceE", with the reason) and offers "Send again".

### Admin newsletters

| Verb | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/newsletters` | admin | List newsletters |
| `POST` | `/api/admin/newsletters` | admin | Create a draft |
| `POST` | `/api/admin/newsletters/draft-ai` | admin | Draft FR/EN copy and a cover photo from a brief (Claude + Unsplash) |
| `GET` | `/api/admin/newsletters/{id}` | admin | Get one newsletter |
| `PUT` | `/api/admin/newsletters/{id}` | admin | Update (refused while a send is running) |
| `DELETE` | `/api/admin/newsletters/{id}` | admin | Delete (refused while a send is running) |
| `POST` | `/api/admin/newsletters/{id}/publish` | admin | Show it in the member portal |
| `POST` | `/api/admin/newsletters/{id}/unpublish` | admin | Hide it from the member portal |
| `POST` | `/api/admin/newsletters/{id}/send` | admin | Email it to every active, opted-in member — or only to `testEmails` when given. A list with no valid address is refused |
| `POST` | `/api/admin/newsletters/{id}/resend-failed` | admin | Retry only the recipients the last real send recorded as failed |

## Configuration

Place a `.env.local` at the **repo root** (same as the old Next.js app). `dotnet run` loads
`.env` then `.env.local` automatically via `Configuration/DotEnvLoader.cs` before mapping into
`IConfiguration`. Existing shell / App Service environment variables are never overwritten.

Legacy variable names are still understood — see `Program.cs:MapLegacyEnvVars`. You can also use
`appsettings.json` sections or Azure App Service application settings in production.

Required for the waitlist:
- `SENDGRID_API_KEY`, `FROM_EMAIL`, `ADMIN_EMAIL`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`

Optional:
- `LEADS_WEBHOOK_API_KEY`, `LEADS_WEBHOOK_URL`
- `ACTIVITY_REPORT_KEY`, `ACTIVITY_IP_SALT`, `ACTIVITY_DAILY_REPORT_TO`
- `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_TABLE_NAME`
- `SITE_URL` (used in email logo links)

### CadenceE onboarding

| Variable | Required | Notes |
| --- | --- | --- |
| `CADENCE_ONBOARDING_SECRET` | To turn it on | The signing secret the CRM shows once (Settings → Welcome & portal). Empty or shorter than 32 characters: the endpoint answers `503` in every environment |
| `CADENCE_SIGNATURE_TOLERANCE_SECONDS` | No | How old a signed timestamp may be. Default `300`, clamped to 30…3600 |
| `CADENCE_WELCOME_LINK_TTL_HOURS` | No | Lifetime of the welcome set-password link. Default `168` (7 days), clamped to 1…720 |
| `AZURE_STORAGE_CADENCE_EVENTS_TABLE` | No | Defaults to `CadenceEvents` |

### Meetings

| Variable | Required | Notes |
| --- | --- | --- |
| `MEETINGS_NOTIFY_EMAILS` | No | Who is told about each booking until an admin saves the meeting settings, which then keep their own list. Comma-separated. Default `info@pavillon46.ch` |
| `CADENCE_ONBOARDING_SECRET` | For invitations | The CadenceE secret (above). Verifies invitation tokens and signs every post to the CRM. Without it, invitation links are not honoured and walk-ins go to the leads webhook |
| `CADENCE_ORGANIZATION_ID` | No | The CadenceE workspace id. With `CADENCE_CRM_URL`, walk-ins are reported to the CRM itself (time, message, cancellation) |
| `CADENCE_CRM_URL` | No | The CRM's base URL without `/api`, e.g. `https://api.cadencee.ai`. `https` only outside Development |
| `LEADS_WEBHOOK_API_KEY` | For the fallback | Walk-ins go to the leads webhook when the two settings above are not set; without the key they reach the CRM not at all (marked "Not yet in CadenceE" in the console) |
| `AZURE_STORAGE_MEETINGS_TABLE` | No | Defaults to `Meetings` (settings, day overrides and bookings, one partition each) |

Emails need SendGrid; without it the booking still succeeds and the missing emails are logged.

### Newsletters

| Variable | Required | Notes |
| --- | --- | --- |
| `NEWSLETTER_UNSUBSCRIBE_SECRET` | **Yes, to send** | Signs the per-member unsubscribe link. `openssl rand -base64 48` |
| `ANTHROPIC_API_KEY` | For AI drafting | Server-side only; never reaches a client |
| `ANTHROPIC_MODEL` | No | Defaults to `claude-sonnet-5` |
| `UNSPLASH_ACCESS_KEY` | No | Without it there is **no automatic cover image** — see below |
| `NEWSLETTER_BATCH_SIZE` | No | Recipients per SendGrid request; capped at 1000 either way |
| `AZURE_STORAGE_NEWSLETTERS_TABLE` | No | Defaults to `Newsletters` |

`NEWSLETTER_UNSUBSCRIBE_SECRET` is enforced rather than merely recommended. Both it and its
`AUTH_TOKEN_SECRET` fallback ship with defaults committed to this repository, so a deploy that
forgot it would sign unsubscribe links with a publicly-known string — anyone reading the source
could mint a valid link for any member id and silently stop their delivery. Outside Development
the service therefore refuses to sign (sending fails loudly instead of mailing forgeable links),
refuses to validate (such a link is indistinguishable from a forgery), and logs `CRITICAL` at
startup.

**On `UNSPLASH_ACCESS_KEY`.** It is optional, but it is the difference between the AI picking a
photograph and not picking one:

- **Set** — the server queries `https://api.unsplash.com/search/photos` with the AI's search
  phrase and persists one concrete, permanent `images.unsplash.com` URL, so every recipient sees
  the same photograph. It also returns the photographer's name and profile URL, which Unsplash's
  API terms require crediting wherever the photo appears.
- **Unset** — no cover is resolved. The draft returns an **empty** cover URL plus the keyword and
  `coverImageStatus: "no_api_key"`, and the editor says the photograph still needs choosing
  rather than rendering a broken image. Nothing is fabricated.

`coverImageStatus` is one of `resolved`, `no_api_key`, `no_match`, `lookup_failed` or
`no_keyword`. The server sets these fields *after* deserializing the model's JSON and overwrites
them unconditionally, so a model cannot forge an attribution or claim a cover was resolved. A
slow or unreachable Unsplash never fails or delays a draft — the copy is the valuable part.

This replaced an earlier approach that guessed at `source.unsplash.com/1200x600/?keyword`. That
endpoint is retired, so it almost always failed and fell back to a default image while presenting
it as an AI-chosen photograph; on the rare occasion it did resolve it was non-deterministic,
meaning each recipient's mail client could render a different photo from the same URL.

## Run locally

```bash
cd backend/Pavillon46.Api
dotnet restore
dotnet run
```

The API listens on `http://localhost:5246`. CORS is open to `http://localhost:5173`
(the Vite dev server) by default.
