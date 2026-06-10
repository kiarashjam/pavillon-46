# Pavillon 46 - Architecture Overview

## High-level

```
pavillon-46/
├── backend/                          # ASP.NET Core 8 Web API
│   ├── Pavillon46.sln
│   └── Pavillon46.Api/
│       ├── Controllers/              # /api/* HTTP endpoints
│       ├── Services/                 # SendGrid, Twilio, ActivityStore, LeadsWebhook, DailyReport
│       ├── Models/                   # DTOs + IOptions classes
│       ├── Localization/             # Email translations (FR/EN)
│       ├── Privacy/                  # IP hashing, click/referrer sanitization
│       └── Program.cs                # Composition root + legacy env var mapping
│
├── frontend/                         # React + Vite + TypeScript SPA
│   ├── index.html
│   ├── vite.config.ts                # Dev server proxies /api → backend:5246
│   ├── public/                       # Static assets (logo, fonts, favicon)
│   └── src/
│       ├── main.tsx                  # React + BrowserRouter entry point
│       ├── App.tsx                   # Routes
│       ├── pages/                    # Home, Waitlist, ThankYou, Login, Legal, Privacy, AdminActivity
│       ├── components/               # Header, Footer, PageLayout, ActivityTracker
│       ├── contexts/                 # LanguageContext (FR/EN, localStorage-persisted)
│       ├── lib/                      # translations.ts, api.ts, constants.ts
│       └── styles/                   # globals.css + desktop/tablet/mobile responsive CSS
│
├── azure/                            # Bicep templates for Azure SWA deployment
├── .github/workflows/                # CI for both apps + daily activity report cron
└── .env.local.example                # Legacy env var names still understood by the backend
```

## Request flow

1. The Vite SPA in `/frontend` is served as a static site (Azure Static Web Apps in production).
2. Client requests to `/api/*` are routed to the ASP.NET Core API in `/backend`. In development,
   Vite proxies them; in production, configure your reverse proxy or App Service routing.
3. Activity events from `ActivityTracker.tsx` are POSTed to `/api/activity/log`, where the
   backend hashes the visitor IP and writes to Azure Table Storage (with a file/in-memory
   fallback when Azure isn't configured).
4. Waitlist submissions:
   - `POST /api/send-verification` → Twilio Verify SMS
   - `POST /api/verify-code` → Twilio code check
   - `POST /api/send-email` → SendGrid (admin + user emails) → ACI lead webhook
5. The daily report cron (`.github/workflows/activity-daily-report.yml`) hits
   `POST /api/activity/daily-report` once per day, which queries activity and emails a summary.

## Configuration

The backend reads either modern `appsettings.json` sections **or** the legacy `.env.local`
variable names from the previous Next.js project (see `Program.cs:MapLegacyEnvVars`). Drop in
the same env file you used before — no changes required to your secret store.
