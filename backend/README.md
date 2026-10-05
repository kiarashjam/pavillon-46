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
