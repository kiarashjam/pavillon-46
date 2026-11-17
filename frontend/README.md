# Pavillon 46 – Frontend (React + Vite + TypeScript)

The web client: public site, member portal and admin console. It talks to the .NET API in
`/backend`. Conventions for changing it are in [`AGENTS.md`](./AGENTS.md).

## Routes

All routes are declared in `src/App.tsx`.

### Public

| Path | Component | Purpose |
| --- | --- | --- |
| `/` | `Home` | Landing page |
| `/waitlist` | `Waitlist` | 3-step waitlist: details, how you heard of us, mobile number + SMS code (Twilio) |
| `/thank-you` | `ThankYou` | Confirmation after joining the waitlist |
| `/login` | `Login` | Member sign-in |
| `/set-password` | `SetPassword` | Member chooses a password at first sign-in (the portal sends them here) |
| `/forgot-password` | `ForgotPassword` | Member requests a reset link |
| `/reset-password` | `ResetPassword` | Member sets a new password from the emailed link. With `&welcome=1` (the CadenceE welcome email) it shows welcome copy for a first password |
| `/rendez-vous` | `Booking` (`lang="fr"`) | Book a meeting: free days, times, details, confirmation with an `.ics` download. `?invite=` takes a CadenceE invitation token (prefills and locks name and email, shows the code) |
| `/en/meeting` | `Booking` (`lang="en"`) | The same page in English. The address sets the language; its FR/EN switch moves between the two addresses and keeps the visitor's choice |
| `/legal` | `LegalOrPrivacy` | Legal notices |
| `/privacy` | `LegalOrPrivacy` | Privacy policy |

### Member portal — signed-in members (`ProtectedRoute` → `DashboardLayout`)

| Path | Component | Purpose |
| --- | --- | --- |
| `/dashboard` | `Overview` | Home of the portal |
| `/dashboard/referral` | `Referral` | Refer someone |
| `/dashboard/referrals` | `MyReferrals` | People the member has referred |
| `/dashboard/newsletters` | `Newsletters` | Published newsletters; email opt-in / opt-out |
| `/dashboard/profile` | `Profile` | Name, contact details and language |

### Admin sign-in

| Path | Component |
| --- | --- |
| `/admin/login` | `AdminLogin` |
| `/admin/set-password` | `AdminSetPassword` (first sign-in, or after a reset by another admin) |
| `/admin/forgot-password` | `AdminForgotPassword` |
| `/admin/reset-password` | `AdminResetPassword` |

### Admin console — signed-in admins (`AdminLayout`)

| Path | Component | Purpose |
| --- | --- | --- |
| `/admin` | `AdminOverview` | Overview |
| `/admin/people` | `AdminPeople` | Directory of admins, members and waitlist submitters |
| `/admin/members` | `AdminPeople` | The directory, opened on members |
| `/admin/referrals` | `AdminPeople` | The directory, opened on submitters |
| `/admin/activity` | `AdminActivitySection` | Visitor analytics |
| `/admin/newsletters` | `AdminNewslettersSection` | Newsletter list |
| `/admin/newsletters/:id` | `AdminNewsletterEditor` | Write, AI-draft, publish and send a newsletter |
| `/admin/meetings` | `AdminMeetingsSection` | Meetings: a month calendar (each day open, full or closed in one click), the bookings (cancel; "Send again" for one not yet in CadenceE), weekly hours and booking rules. `?tab=calendar\|bookings\|rules` |

`Booking` and `AdminMeetingsSection` are lazy-loaded (`React.lazy` in `App.tsx`).

There is no catch-all route: an unknown path renders an empty page.

## Run locally

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
npm run lint
npm run build    # typecheck (tsc -b) + production build
```

Vite serves on `http://localhost:5173` and proxies `/api/*` to
`http://localhost:5246` (the .NET backend in `/backend`). Open it on `localhost`, not
`127.0.0.1` — the API's CORS policy allows the former only.

## Build-time variables

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | API origin for production builds. Leave unset in development to use the proxy. |
| `VITE_ACTIVITY_LOG_ENABLED` | Set to `false` to stop sending page-view events. |
