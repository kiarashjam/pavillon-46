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

Copy `.env.local.example` to `.env.local` at the repo root. `dotnet run` loads it automatically
(the same file the old Next.js app used). In Azure, set the same names as App Service application
settings. See `backend/README.md`, `frontend/README.md`, and `azure/README.md` for details.

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## CI / Deployment

- `.github/workflows/build.yml` — CI build on every push and PR.
- `.github/workflows/azure-static-web-app.yml` — deploys the Vite SPA to Azure Static Web Apps
  (with `/api/*` proxy to the backend).
- `.github/workflows/azure-backend-app-service.yml` — deploys the .NET 8 API to Azure App Service.
- `.github/workflows/activity-daily-report.yml` — daily cron hitting
  `POST /api/activity/daily-report`.

See [`azure/README.md`](./azure/README.md) for Bicep infrastructure and required GitHub secrets.
