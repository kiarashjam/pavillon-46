# Pavillon 46 - Architecture Overview

## High-level

```
pavillon-46/
├── backend/                          # ASP.NET Core 8 Web API
│   ├── Pavillon46.sln
│   └── Pavillon46.Api/
│       ├── Controllers/              # /api/* endpoints: public, member, admin
│       ├── Services/                 # Stores, email, SMS, newsletter render/send, AI drafting
│       ├── Security/                 # Session tokens, [MemberAuthorize]/[AdminAuthorize], hashing
│       ├── Models/                   # DTOs, records, Options classes, SiteFacts
│       ├── Localization/             # Email translations (FR/EN)
│       ├── Privacy/                  # Strips personal data from activity events
│       ├── Configuration/            # .env loader
│       └── Program.cs                # Composition root + legacy env var mapping
│
├── frontend/                         # React + Vite + TypeScript SPA
│   ├── index.html
│   ├── vite.config.ts                # Dev server proxies /api → backend:5246
│   ├── public/                       # Static assets (images, fonts, favicons)
│   └── src/
│       ├── main.tsx                  # Entry point; loads every stylesheet
│       ├── App.tsx                   # All routes
│       ├── pages/                    # Public pages: home, waitlist, sign-in, password, legal
│       │   ├── dashboard/            # Member portal
│       │   └── admin/                # Admin console
│       ├── components/               # Shared layout, route guard, activity tracker
│       │   ├── dashboard/            # Member portal layout
│       │   └── admin/                # Admin layout, form kit, modals
│       ├── contexts/                 # Language, member session, admin session
│       ├── lib/                      # api.ts, translations.ts, motion.ts, constants.ts
│       └── styles/                   # Global CSS, one file per area
│
├── azure/                            # Bicep: SWA (frontend) + App Service (API) + Table Storage
├── .github/workflows/                # CI, SWA deploy, App Service deploy, daily report cron
├── AGENTS.md                         # Instructions for AI coding agents (+ frontend/, backend/)
└── .env.local.example                # Every environment variable the backend reads
```

## Request flow

1. **Hosting.** The SPA is a static site (Azure Static Web Apps in production). Requests to
   `/api/*` go to the ASP.NET Core API: in development Vite proxies them; in production the
   `staticwebapp.config.json` written by the deploy workflow forwards them to the App Service
   URL in the `API_BASE_URL` GitHub secret.
2. **Activity.** `ActivityTracker.tsx` POSTs page views and clicks to `/api/activity/log` (never
   from `/admin`). The API hashes the visitor IP with `ACTIVITY_IP_SALT`, strips personal data,
   and stores the event. The admin console reads it back through `/api/activity/report`.
3. **Waitlist.**
   - `POST /api/send-verification` → Twilio Verify SMS
   - `POST /api/verify-code` → Twilio code check
   - `POST /api/send-email` → SendGrid (admin + applicant emails) → ACI lead webhook
4. **Members.** Admins create member accounts, and the member receives credentials by email.
   `POST /api/auth/login` returns a signed session token, which the SPA keeps in `localStorage`
   and sends as `Authorization: Bearer …`. `[MemberAuthorize]` checks it on every
   `/api/members/*` call, reloading the member to confirm the account is active and the
   password hasn't changed since the token was issued.
5. **Admins.** The same scheme, with separate tokens, routes (`/api/admin/*`) and filter
   (`[AdminAuthorize]`). One admin is seeded at boot.
6. **Newsletters.** An admin writes a newsletter, or drafts it from a brief
   (`/api/admin/newsletters/draft-ai`: Claude writes FR/EN copy, Unsplash supplies a cover).
   Publishing makes it visible in the member portal. Sending emails it, through SendGrid, to
   every active member who hasn't opted out, each with a signed one-click unsubscribe link
   (`GET /api/newsletters/unsubscribe`).
7. **Daily report.** `.github/workflows/activity-daily-report.yml` calls
   `POST /api/activity/daily-report` once a day, which emails an activity summary.

## Data

Every record is stored as JSON in Azure Table Storage, one table per kind:

| Table | Holds |
| --- | --- |
| `ActivityEvents` | Visitor activity (IP hashed) |
| `Members` | Member accounts |
| `Applicants` | Waitlist submitters and referrals |
| `Admins` | Admin accounts |
| `PasswordResetTokens` | Hashed, single-use reset tokens |
| `Newsletters` | Newsletters, their send history and failed recipients |

Without `AZURE_STORAGE_CONNECTION_STRING` each store falls back to a JSONL file, then to memory —
for development only.

## Configuration

The backend loads repo-root `.env` / `.env.local` on startup (`Configuration/DotEnvLoader.cs`),
then maps legacy variable names into `IConfiguration` (`Program.cs:MapLegacyEnvVars`). Production
uses Azure App Service application settings with the same names; see `backend/README.md` for the
full list and `azure/README.md` for which ones production needs. CORS allows `localhost` on any
port, `pavillon46.ch` and its subdomains, and any `*.azurestaticapps.net` preview hostname.
