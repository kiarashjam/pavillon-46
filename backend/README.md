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
| `POST` | `/api/admin/auth/forgot-password` | Admin forgot-password (always 200; emails a reset link) |
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

## Run locally

```bash
cd backend/Pavillon46.Api
dotnet restore
dotnet run
```

The API listens on `http://localhost:5246`. CORS is open to `http://localhost:5173`
(the Vite dev server) by default.
