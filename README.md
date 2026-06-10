# Pavillon 46

The Pavillon 46 website — a bilingual (French / English) waitlist, member-area, and internal
activity dashboard for an invitation-only Swiss venue opening end of 2027.

This repository contains two apps:

- **`/backend`** – ASP.NET Core 8 Web API (.NET 8). All `/api/*` endpoints.
- **`/frontend`** – React 18 + Vite + TypeScript SPA. All pages and components.

It replaces the original Next.js implementation: the API routes moved to .NET, and the React
pages were ported to a Vite SPA. The public asset folder, FR/EN translations, animations, and
the overall UX are preserved.

## Quick start

You need two terminals.

```bash
# Backend (http://localhost:5246)
cd backend/Pavillon46.Api
dotnet restore
dotnet run

# Frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

Vite proxies `/api/*` requests to the .NET API automatically — open
[http://localhost:5173](http://localhost:5173) and the waitlist will hit the real backend.

## Configuration

Copy `.env.local.example` to `.env` (or set the variables in your hosting platform). The .NET
backend understands the legacy env var names from the Next.js version, so the same secret store
keeps working. See `backend/README.md` and `frontend/README.md` for details.

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## CI / Deployment

- `.github/workflows/build.yml` builds both apps on every push and PR.
- `.github/workflows/azure-static-web-app.yml` deploys the Vite build to Azure Static Web Apps.
- `.github/workflows/activity-daily-report.yml` triggers the backend's daily report endpoint
  (`POST /api/activity/daily-report`) on a Zurich-time-aware schedule. It now reads an
  `API_BASE_URL` secret pointing at wherever the .NET backend is hosted.

The .NET backend itself is intended to run on Azure App Service / Container Apps. Add your own
deployment workflow that targets your chosen host once the resource is provisioned.
