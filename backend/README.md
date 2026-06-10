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
| `GET`  | `/healthz` | Health check |

## Configuration

The legacy `.env.local` variable names are still understood — see `Program.cs:MapLegacyEnvVars`. You
can either set those env vars directly or use the standard `appsettings.json` sections.

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
