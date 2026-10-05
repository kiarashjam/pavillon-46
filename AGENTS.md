# AGENTS.md — Pavillon 46

Instructions for AI coding agents (Cursor, Claude Code, Codex, …) working in
this repository. Read this file first. `frontend/AGENTS.md` and
`backend/AGENTS.md` add the rules for each app and apply on top of this one.

Reference docs — read them when the task touches their area, and keep them
accurate when you change what they describe:

| File | Covers |
| --- | --- |
| `README.md` | Quick start, CI/deployment overview |
| `ARCHITECTURE.md` | How the pieces fit together, request flows |
| `frontend/README.md` | Every route and the component that renders it |
| `backend/README.md` | Every endpoint, every environment variable |
| `azure/README.md` | Bicep infrastructure, App Service and GitHub secrets |

## What this is

The website of **Pavillon 46**, a private, invitation-only members' club at
La Croix-sur-Lutry, above Lake Geneva near Lausanne (Switzerland), opening in
2028. Everything public is **bilingual French/English; French is the default.**

| App | Stack | Path | Dev URL |
| --- | --- | --- | --- |
| API | ASP.NET Core 8 Web API (controllers), Azure Table Storage | `backend/Pavillon46.Api` | http://localhost:5246 |
| Web | React 18, Vite 5, TypeScript, react-router 6, framer-motion 12 | `frontend` | http://localhost:5173 |

Three product areas:

- **Public site** — landing page, a 5-step waitlist with SMS verification,
  legal and privacy pages.
- **Member portal** (`/dashboard`) — profile, referrals, newsletters.
- **Admin console** (`/admin`) — people (admins, members, waitlist
  submitters), visitor analytics, and newsletters: write or AI-draft them,
  publish them to the portal, email them to members.

Production: the SPA is on Azure Static Web Apps, which forwards `/api/*` to the
API on Azure App Service. Pushes to `master` deploy automatically.

## Run it locally

```bash
cp .env.local.example .env.local                 # at the repo root; the API reads it on startup
cd backend  && dotnet run --project Pavillon46.Api   # http://localhost:5246
cd frontend && npm install && npm run dev            # http://localhost:5173
```

- Vite proxies `/api/*` to the API, so in development the browser talks to a
  single origin.
- No Azure connection string? Data goes to JSONL files, then to memory. That
  is fine for development, but in-memory data is gone after a restart.
- The API starts without SendGrid, Twilio, Anthropic or Unsplash keys. Each
  feature that needs one returns an error or degrades (no cover photo, no
  SMS, no email) instead of crashing.
- **Signing in to the admin console:** the API seeds one admin at boot
  (`SeedInitialAdminAsync` in `Program.cs`). Set `ADMIN_SEED_PASSWORD` to
  choose its password. If you don't, a temporary password is generated and
  printed in the API log — in Development only. The seeded admin must change
  it on first sign-in.
- Open the app on **`localhost`, not `127.0.0.1`**: CORS allows `localhost` on
  any port, but not the IP address.
- `launchSettings.json` overrides environment variables such as
  `ASPNETCORE_URLS`. Run `dotnet run --no-launch-profile` when you need
  yours to win.

## Verify before you push

**There are no automated tests yet.** CI (`.github/workflows/build.yml`) runs
the commands below on every PR, and the PR must pass them. Run them locally
first:

```bash
cd frontend && npm ci && npm run lint && npm run build       # build = tsc -b && vite build
cd backend  && dotnet build Pavillon46.Api/Pavillon46.Api.csproj -c Release \
            && dotnet publish Pavillon46.Api/Pavillon46.Api.csproj -c Release -o ./publish --no-build
rm -rf backend/publish                                       # not git-ignored, never commit it
```

- Keep the backend at **0 build warnings** and the frontend at **0 lint
  errors**. Four lint warnings already exist (listed under open work) — don't
  add to them.
- Since nothing is tested automatically, **run the app and use what you
  changed**: in French and in English, and at phone width. Say in the PR
  description what you checked by hand.

## How to work here

- Branch from `master` and open a pull request; never push to `master`. Keep
  one topic per PR. CI runs on every PR; an automated security review runs
  once a PR is marked ready for review.
- Match the surrounding code: naming, idioms, comment density. Comments here
  explain **why** — the codebase records the reason for non-obvious decisions
  next to the code. Keep those comments true when you change the code.
- Adding or changing a route, an endpoint or an environment variable? Update
  `frontend/README.md`, `backend/README.md` or `.env.local.example` in the same
  PR.
- Never commit secrets or real member data. `.env.local` is git-ignored;
  `.env.local.example` contains placeholders only.
- Don't change these without the owner asking: the seed admin's email
  (`AuthOptions.DefaultAdminSeedEmail`, deliberately hard-coded and
  insert-only), the brand palette, and any legal or privacy wording.

## Rules that apply everywhere

- **Bilingual copy.** Every user-visible string on the public site and in the
  member portal lives in `frontend/src/lib/translations.ts`, in **both** `fr`
  and `en`. Emails are bilingual too
  (`backend/Pavillon46.Api/Localization/EmailTranslations.cs`). The admin
  console is English-only, **except** its newsletter pages.
- **The opening year** has one constant per app: `OPENING_YEAR` in
  `frontend/src/lib/translations.ts`, and `SiteFacts.OpeningYear` in
  `backend/Pavillon46.Api/Models/SiteFacts.cs`. Change both together.
- **Configuration** uses UPPER_SNAKE environment variable names, mapped onto
  typed Options classes by `MapLegacyEnvVars` in `Program.cs`. To add a
  setting: map it there, add the property in `Models/Options.cs`, then add it
  to `.env.local.example` and to the table in `backend/README.md`.
- **Email HTML uses inline styles only** — mail clients ignore CSS variables
  and `<style>` blocks. HTML-encode anything a member or an admin typed.
- **Brand colours** are CSS variables in `frontend/src/styles/globals.css`
  (`--color-green`, `--color-coral`, `--color-cream`, `--color-lavender`).
  Use them; don't add hard-coded hex values.

## Security rules — never break these

They protect real people's data and inboxes. If a task looks like it needs one
of them broken, stop and ask the owner. `backend/AGENTS.md` has the detail and
the code locations.

1. **Member flows never reveal whether an account exists.**
   `POST /api/auth/forgot-password` always answers `200 {ok:true}` and pads its
   response time. Keep it that way. (The *admin* forgot-password currently does
   reveal it — an open product decision, listed under open work. Don't copy
   that pattern anywhere.)
2. **Secrets fail closed.** A missing secret, or one still set to its repo
   default, must disable the feature in production — never fall back to a
   value that is public in this repository. The newsletter unsubscribe secret
   does this. **The session-token secret does not yet** — open work item 1.
3. **Sessions follow the password.** Tokens carry the account's
   `PasswordVersion`; a password change invalidates every older token.
   Self-service changes return a fresh session.
4. **Newsletter sends are guarded** against double sends and accidental
   mass sends. Keep the send claim, the lock on editing while a send runs, the
   editor's block on sending unsaved changes, and the refusal of a blank
   `testEmails` list.
5. **Content never reaches an email as raw HTML.** Newsletter Markdown is
   rendered with HTML disabled, through an allow-list of elements.
6. **The client IP comes only from `HttpContext.Connection.RemoteIpAddress`**
   (set by `ForwardedHeadersMiddleware`). Never read `X-Forwarded-For` yourself.
7. **Compare secrets in constant time** with
   `CryptographicOperations.FixedTimeEquals`.
8. **Never log secrets, tokens, passwords or raw email addresses.** Hash
   identifiers before logging them, as the admin auth code does. One member
   log line still logs a raw address — open work item 4.

## Known issues and open work

Highest priority first. These were found in a full review of the code; none is
fixed yet. Check an item against the current code before starting it.

### Critical

1. **The session-token secret falls back to a value committed in this repo.**
   `AuthOptions.TokenSecret` defaults to
   `"pavillon46-dev-token-secret-change-me"`, and `TokenService` signs and
   checks every member and admin session with it, with no production guard.
   The seed admin's id is predictable (a SHA-256 of `"admin:"` plus its
   hard-coded email) and `PasswordVersion` starts at 0. So wherever
   `AUTH_TOKEN_SECRET` is unset, anyone who has read this code can sign a
   valid admin session. Nothing in `azure/` provisions it.
   - **First, the owner** sets `AUTH_TOKEN_SECRET` in App Service to a long
     random value (`openssl rand -base64 48`). Every existing session ends,
     once.
   - **Then the code fix:** make `TokenService` fail closed outside
     Development when the secret is empty or equals the default, the way
     `UnsubscribeTokenService` does — issue no tokens, accept none, and log
     `Critical` at boot (resolve the service eagerly in `Program.cs`). Public
     pages keep working; sign-in stops until the secret is set. **Never ship
     this before the secret is set in production** — it would lock every
     member and admin out.

### Security and correctness

2. **Admin forgot-password reveals which emails are admins.** It returns
   `400 errorType:"not_admin"` for unknown emails, and its `503
   email_not_configured` / `500 email_failed` answers can only happen for real
   admins (`AdminAuthController.ForgotPassword`). Added on purpose in commit
   `b97ceba` for clearer errors; rate limiting slows enumeration but doesn't
   stop it. **Needs the owner's decision** — don't change it unasked.
3. **Activity report key is compared in non-constant time**
   (`ActivityController.IsAuthorizedAsync`: `provided == expected`). Its `??`
   fallback chain is also dead code: `Headers[...].ToString()` returns `""`,
   never `null`, so only the `x-report-key` header is ever read. Fix: compare
   UTF-8 bytes with `FixedTimeEquals`, and delete the unused fallbacks rather
   than reviving them — a key in a query string leaks into logs.
4. **A member log line records the raw email address**
   (`forgot-password.request` in `AuthController.ForgotPassword`). Hash it, as
   the admin flow does.
5. **The forgot-password timing pad is a floor, not a ceiling.**
   `Task.WhenAll(send, Task.Delay(350))` still runs long whenever SendGrid is
   slow, which hints that the account exists. Low priority.
6. **SMS verification errors return raw exception messages to anonymous
   callers** (`detail = ex.Message` in `VerificationController`). Log the
   exception and return a generic message instead.
7. **`[MemberAuthorize]` accepts any validly signed admin token** without
   checking the admin's account, so a revoked admin token still passes on
   member endpoints. Its comment claims admin tokens carry `pv = 0`, which is
   no longer true. Impact is small: member endpoints find no member with an
   admin's id and answer `401`. Reject admin tokens in that filter, once
   you've checked nothing relies on them.

### Product gaps

8. **No automated tests.** The highest-value next step: an xUnit project
   covering `TokenService`, `PasswordHasher`, `UnsubscribeTokenService`
   (including its fail-closed check), `NewsletterEmailRenderer` (escaping,
   neutralised tokens) and the `testEmails` cleaning in
   `AdminNewslettersController` — then run it in `build.yml`.
9. **Announcements are never shown.** `GET /api/members/events` works, but
   `getEvents` in `frontend/src/lib/api.ts` has no caller.
10. **No 404 page.** `App.tsx` has no catch-all route, so an unknown URL renders
   an empty page.
11. **A long newsletter can fail to save.** `JsonTableStore` stores each
    record as one JSON string property, and Azure Table caps a string
    property at 64 KiB (32,768 characters). Bodies may be up to 10,000
    characters each in French and English, and System.Text.Json's default
    encoder writes every accented character as a six-character `\u00e9`
    escape — so two long bodies can pass the cap. Fix by serialising with a
    relaxed encoder or moving bodies to their own properties or blob
    storage.
12. **"Resend to failed" only knows the first 200 failures** — the failed
    list is capped at 200 member ids (`NewsletterSender`).
13. **Unsubscribe links depend on the Static Web Apps rewrite.** They are
    built from `SITE_URL`, so `/api/*` must keep forwarding to the API.
14. **Members can't change their password whenever they like.** The portal
    has no change-password screen; `POST /api/members/me/change-password` is
    used only by `/set-password`, which `DashboardLayout` forces at first
    sign-in. A "Change password" form on the profile page would close the gap
    — adopt the session it returns with `applySession`.

### Maintenance

15. **Main JS bundle is 651 kB** (Vite warns above 500 kB). Lazy-load the
    `/admin` and `/dashboard` route trees with `React.lazy`.
16. **Four ESLint warnings:** `react-refresh/only-export-components` in
    `contexts/AdminAuthContext.tsx`, `contexts/AuthContext.tsx` and
    `contexts/LanguageContext.tsx` (each exports its hook beside its provider),
    and `react-hooks/exhaustive-deps` in
    `pages/admin/AdminReferralsSection.tsx`.
17. **Dead CSS:** 25 `adm-*` rules in `styles/dashboard.css` that no
    component uses.
18. **Hard-coded brand green:** 26 `#265640` literals and 134
    `rgba(38, 86, 64, …)` values bypass `--color-green`. Before any rebrand,
    add a `--color-green-rgb: 38, 86, 64;` token and convert them to
    `rgba(var(--color-green-rgb), …)`.

### Waiting on the owner

19. The seeded "private preview evening" announcement
    (`AnnouncementService`, dated 2027-06-20) is described as taking place
    shortly before the opening, which is now 2028.
