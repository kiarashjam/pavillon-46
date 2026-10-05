# AGENTS.md — frontend

Rules for `frontend/`. The root `AGENTS.md` applies too — read it first.
Every route and its component is listed in `frontend/README.md`.

React 18 · Vite 5 · TypeScript 5 (strict) · react-router 6 · framer-motion 12 ·
react-markdown 9 · ESLint 9. No test runner is set up.

```bash
npm run dev      # http://localhost:5173 — proxies /api/* to the API on :5246
npm run lint     # must report 0 errors
npm run build    # tsc -b && vite build — this is the typecheck, run it
```

## Where things are

| Path | What lives there |
| --- | --- |
| `src/main.tsx` | Entry point. Imports **all eight stylesheets**, globally. |
| `src/App.tsx` | Every route, and the providers that wrap them. |
| `src/pages/` | Public pages: home, waitlist, thank-you, login, password flows, legal/privacy. |
| `src/pages/dashboard/` | Member portal pages, rendered inside `components/dashboard/DashboardLayout`. |
| `src/pages/admin/` | Admin console pages, rendered inside `components/admin/AdminLayout`. |
| `src/components/admin/` | `adminUi.tsx` (form fields, password meter, empty and loading states), `AdminModal`, `AdminGate` (sign-in screens), `NewsletterSendConfirmModal`. Reuse these before writing new ones. |
| `src/contexts/` | `LanguageContext`, `AuthContext` (members), `AdminAuthContext` (admins). |
| `src/lib/api.ts` | **Every** call to the API, as typed functions. |
| `src/lib/translations.ts` | All French and English copy, plus `OPENING_YEAR`. |
| `src/lib/motion.ts` | Typed easing curves for framer-motion. |
| `src/lib/constants.ts` | App name, default language (`fr`), image paths, shared animation variants. |
| `public/` | Fonts, images, favicons. |

## Routing and access

- **Member portal:** `/dashboard/*` is wrapped in `ProtectedRoute`, which sends
  anyone without a member token to `/login`. Pages read the session with
  `useAuth()`.
- **Admin console:** `/admin/*` is guarded inside `AdminLayout`. It sends
  visitors without an admin token to `/admin/login`, and admins who must change
  their password to `/admin/set-password`. Pages get the token from
  `useOutletContext<AdminCtx>()`, not from the context directly.
- The admin sign-in screens (`/admin/login`, `/admin/forgot-password`, …) are
  outside `AdminLayout`, so they're reachable signed-out.
- There is no catch-all route yet (root `AGENTS.md`, open work), so an unknown
  path renders nothing.

## Sessions

- Two independent sessions, each in `localStorage`: `pavillon46_member_token`
  / `pavillon46_member`, and `pavillon46_admin_token` / `pavillon46_admin`. A
  person can be signed in to both at once.
- On any `401`, `api.ts` dispatches a `pavillon46:unauthorized` window event
  carrying the request path. `AdminAuthContext` signs out on `/api/admin` and
  `/api/activity` paths; `AuthContext` signs out on everything else. Keep that
  split when you add endpoints.
- **Changing a password invalidates the old token on the server.** The
  change-password endpoints return a new session — adopt it with
  `applySession(...)`, or the very next request will sign the user out. The
  password-*reset* endpoints return no session: send the user to sign in.

## Talking to the API

- Add API calls only in `src/lib/api.ts`, through `jsonRequest<T>` (JSON body)
  or `emptyRequest` (`204 No Content`). Both handle errors and the 401 event.
  Don't call `fetch` from components.
- Failures throw `ApiError` with `status`, `message` and an optional
  `errorType`. **Branch on `status` and `errorType`, never on `message`** — the
  message wording is the backend's and can change.
- Send the token with `headers: bearer(token)`.
- `apiUrl()` prefixes `VITE_API_BASE_URL` in production builds. In development
  it's empty and Vite's proxy handles `/api/*`.

## Copy and languages

- Public pages and the member portal: **no hard-coded user-visible text.**
  Add each key to its interface in `translations.ts`, then to **both** the `fr`
  and the `en` objects — TypeScript fails the build if one is missing. Read
  them with `useTranslations(language, '<section>')` and `useLanguage()`.
- Sections: `common`, `home`, `waitlist`, `login`, `dashboard`, `thankYou`,
  `privacy`, `legal`. Member-portal strings go in `dashboard`.
- **The admin console is English-only, hard-coded** — except the newsletter
  pages (`AdminNewslettersSection`, `AdminNewsletterEditor`,
  `NewsletterSendConfirmModal`), which are bilingual and take their strings
  from the `dashboard` section (`newsletter…` keys). Follow whichever
  convention the file you're editing already uses.
- Write natural French, not a word-for-word translation of the English, and
  match the punctuation of the strings around it (the copy mostly uses
  straight apostrophes).
- To state the opening year, interpolate `OPENING_YEAR`; never type the year.

## Styling

- Plain global CSS — no CSS modules, no Tailwind, no CSS-in-JS. All eight
  files load on every page, so **scope every new rule with its area's class
  prefix**:

  | File | Prefixes | Area |
  | --- | --- | --- |
  | `globals.css` | `invite-`, `login-`, `language-`, `activity-` | Base styles, landing page, `:root` palette |
  | `desktop.css` / `tablet.css` / `mobile.css` | `form-`, `hear-`, `legal-`, `step-`, … | Public pages, by breakpoint (≤1439 / ≤1023 / ≤767 / ≤479 px) |
  | `waitlist-premium.css` | `waitlist-`, `wl-` | Waitlist |
  | `auth.css` | `auth-` | Member sign-in and password pages |
  | `dashboard.css` | `dash-` | Member portal (tokens `--dash-*`) |
  | `admin.css` | `adash-` | Admin console, dark theme (tokens `--ad-*`) |

- Colours: use `var(--color-green)`, `var(--color-coral)`, `var(--color-cream)`,
  `var(--color-lavender)` — or the area tokens (`--dash-*`, `--ad-*`). Don't
  add hex literals. Existing hard-coded greens are a known issue (root
  `AGENTS.md`, open work).
- Font: Jost (`var(--font-primary)`), self-hosted in `public/fonts`.
- Check every UI change at phone width.

## Motion

- framer-motion 12's types reject a plain `number[]` for `ease`. Import the
  typed curves from `src/lib/motion.ts` (`EASE_OUT`, `EASE_SOFT`,
  `EASE_SMOOTH_OUT`, …) instead of writing arrays inline.
- Reduced motion is handled globally: `<MotionConfig reducedMotion="user">`
  in `main.tsx` makes every framer-motion animation follow the OS setting.
  Keep it. CSS animations need their own
  `@media (prefers-reduced-motion: reduce)` block, as the existing ones have.

## Accessibility

Existing patterns to follow:

- Form errors render with `role="alert"`; async status messages go in an
  `aria-live` region.
- Interactive elements are real `<button>`s and `<Link>`s. Don't make a `<div>`
  or a table row clickable — backdrop scrims that close a modal or menu are
  the only exception.
- Standalone pages set `document.title` in an effect. Pages inside
  `DashboardLayout` and `AdminLayout` don't yet; give new ones a title.
- Give every field a visible label — `AdminField` does this in the console.

## Gotchas

- **`public/staticwebapp.config.json` is overwritten at deploy.** The workflow
  `.github/workflows/azure-static-web-app.yml` writes the real file (including
  the `/api/*` forwarding and the security headers) from a heredoc. Change
  routing or headers there, or your edit never reaches production.
- `ActivityTracker` posts page views to `/api/activity/log`, skips every
  `/admin` path, and is switched off when `VITE_ACTIVITY_LOG_ENABLED=false`.
  Don't send personal data in its payloads.
- `getEvents` in `api.ts` exists but nothing calls it yet (root `AGENTS.md`,
  open work).
