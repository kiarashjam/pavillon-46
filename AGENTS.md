# AGENTS.md

## Cursor Cloud specific instructions

Pavillon 46 is a two-app repo (see `README.md` and `ARCHITECTURE.md`):

- `backend/Pavillon46.Api` — ASP.NET Core 8 Web API, serves `/api/*` on `http://localhost:5246`.
- `frontend` — React 18 + Vite + TypeScript SPA on `http://localhost:5173`, which proxies `/api/*` to the backend (`frontend/vite.config.ts`).

### Toolchain (already provisioned in the VM image)

The .NET 8 SDK (`dotnet`, apt package `dotnet-sdk-8.0`) and Node 22 are baked into the environment snapshot. The startup update script only refreshes dependencies (`npm --prefix frontend ci` and `dotnet restore backend/Pavillon46.Api/Pavillon46.Api.csproj`); it does not reinstall the SDKs.

### Running the two dev servers

Start each in its own long-lived (tmux) session — do not background them in a one-shot shell:

- Backend: `cd backend/Pavillon46.Api && dotnet run` (listens on `:5246`, Swagger at `/swagger` in Development, health at `/healthz`).
- Frontend: `cd frontend && npm run dev` (listens on `:5173`). Open the app at `http://localhost:5173`; hitting the backend port directly won't serve the SPA.

Start the backend before (or alongside) the frontend so the Vite `/api` proxy has a target.

### Local configuration and data (non-obvious)

- The backend loads a repo-root `.env.local` on startup via `Configuration/DotEnvLoader.cs` (legacy env var names, mapped in `Program.cs:MapLegacyEnvVars`). This repo ships `.env.local.example`; a working dev `.env.local` already exists in the VM workspace (it is gitignored, so it is not in the PR). The app also runs fine with no `.env.local` — SendGrid/Twilio/Azure are optional and their stores fall back to in-memory/JSON-file persistence when unset (waitlist email/SMS just log as "not delivered").
- On startup the API seeds one admin, `kia@bonapp.group` (`Program.cs:SeedInitialAdminAsync`, insert-only). In Development the generated temporary password is written to the backend log, or set `ADMIN_SEED_PASSWORD` in `.env.local` to pin it (the dev `.env.local` here uses `DevAdminPass123!`). The seeded admin starts with `mustChangePassword=true`, so first login redirects to `/admin/set-password`. Admin console lives at `/admin/login` → `/admin`.

### Lint / test / build

- Frontend lint: `cd frontend && npm run lint` (currently 0 errors, a few pre-existing `react-refresh`/`react-hooks` warnings).
- Frontend build/typecheck: `cd frontend && npm run build` (`tsc -b && vite build`).
- Backend build: `dotnet build backend/Pavillon46.Api/Pavillon46.Api.csproj`.
- There is no automated test project in the repo; CI (`.github/workflows/build.yml`) only lints + builds the frontend and restores/builds/publishes the backend.
