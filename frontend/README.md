# Pavillon 46 – Frontend (React + Vite + TypeScript)

The replacement client for the original Next.js pages. It talks to the .NET API in `/backend`.

## Routes

| Path | Component |
| --- | --- |
| `/` | `Home` |
| `/waitlist` | `Waitlist` (5-step form, Twilio SMS verification) |
| `/thank-you` | `ThankYou` |
| `/login` | `Login` (placeholder for the future member portal) |
| `/legal` | `Legal` |
| `/privacy` | `Privacy` |
| `/admin/login` | `AdminLogin` (cinematic admin gate) |
| `/admin/forgot-password` | `AdminForgotPassword` |
| `/admin/reset-password` | `AdminResetPassword` |
| `/admin/set-password` | `AdminSetPassword` |
| `/admin` | Admin console (overview, people, activity) |
| `/admin/people` | Directory of admins, members and submitters |

## Run locally

```bash
cd frontend
npm install
npm run dev
```

Vite serves on `http://localhost:5173` and proxies `/api/*` to
`http://localhost:5246` (the .NET backend in `/backend`).
