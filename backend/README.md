# Pavillon 46 – Backend (.NET 8 ASP.NET Core Web API)

This is the ASP.NET Core 8 backend that powers the Pavillon 46 site. It replaces the original
Next.js API routes (`/pages/api/*`) and exposes the same endpoints under `/api/*`.

## Endpoints

| Verb | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/send-email` | Waitlist signup → admin notification + user confirmation + ACI lead webhook |
| `POST` | `/api/send-verification` | Twilio SMS code send |
| `POST` | `/api/verify-code` | Twilio SMS code check |
| `POST` | `/api/activity/log` | Client activity tracker (page views, clicks) |
| `GET`  | `/api/activity/report` | Admin activity report (requires `x-report-key`) |
| `POST` | `/api/activity/daily-report` | Cron-driven daily email summary |
| `POST` | `/api/admin/auth/forgot-password` | Admin forgot-password (emails a reset link, or 404 if not an admin) |
| `POST` | `/api/admin/auth/reset-password` | Consume admin reset token and set a new password |
| `GET`  | `/api/admin/admins` | List admin accounts |
| `POST` | `/api/admin/admins` | Invite / create an admin (returns a one-time password) |
| `PUT`  | `/api/admin/admins/{id}` | Edit an admin (name, email, status) |
| `DELETE` | `/api/admin/admins/{id}` | Delete an admin (not yourself / not the last active) |
| `POST` | `/api/admin/applicants` | Add a submitter by hand |
| `PATCH` | `/api/admin/applicants/{id}` | Edit a submitter's details or status |
| `GET`  | `/healthz` | Health check |

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
