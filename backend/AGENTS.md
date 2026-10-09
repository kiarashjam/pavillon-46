# AGENTS.md — backend

Rules for `backend/`. The root `AGENTS.md` applies too — read it first, and
especially its security rules. Every endpoint and environment variable is
listed in `backend/README.md`.

ASP.NET Core 8 Web API with controllers. No database and no ORM: records are
JSON in Azure Table Storage. No test project yet.

```bash
dotnet run --project Pavillon46.Api                        # http://localhost:5246, Development
dotnet build Pavillon46.Api/Pavillon46.Api.csproj -c Release   # must stay at 0 warnings
```

Swagger UI is served at `/swagger` in Development. `/healthz` answers
`{ ok: true }`.

## Where things are (`Pavillon46.Api/`)

| Path | What lives there |
| --- | --- |
| `Program.cs` | Service registration, middleware order, CORS, `MapLegacyEnvVars` (env var → config), admin seeding at boot. |
| `Controllers/` | One controller per area: `Auth` (member sign-in and password reset), `Members` (member portal), `AdminAuth`, `AdminMembers` (members and waitlist applicants), `AdminAdmins`, `AdminNewsletters`, `Newsletters` (public unsubscribe), `Activity`, `Verification` (SMS), `Email` (waitlist submission). |
| `Services/` | Stores, email, SMS, AI drafting, newsletter rendering and sending. |
| `Security/` | `TokenService`, the `[MemberAuthorize]` / `[AdminAuthorize]` filters, `PasswordHasher`, `ResetTokenGenerator`. |
| `Models/` | DTOs and records (`Dtos.cs`, `MemberModels.cs`, `NewsletterModels.cs`), `Options.cs` (all settings), `SiteFacts.cs`. |
| `Localization/EmailTranslations.cs` | French and English email copy. |
| `Configuration/DotEnvLoader.cs` | Loads the repo-root `.env` / `.env.local`. |
| `Privacy/` | Strips personal data (referrers, click text, user agents) from visitor-activity events before they are stored. |

## Writing an endpoint

- JSON is camelCase in and out, and `null` properties are omitted.
- **Errors are `{ message, errorType? }`.** `message` is shown to people;
  `errorType` is a stable machine code the frontend branches on. Add an
  `errorType` whenever the client must react to one specific failure.
- **Protect it with an attribute:** `[MemberAuthorize]` or `[AdminAuthorize]`,
  on the controller or on the action. Each filter verifies the token's
  signature, reloads the account, and rejects it unless it is `active` and its
  `PasswordVersion` matches the token. Don't hand-roll token checks.
  `ActivityController` does, because it also accepts the cron's report key; if
  you ever copy it, copy the status and version checks too.
- Read the caller with `HttpContext.GetMember()` or `HttpContext.GetAdmin()`.
  Both return a `MemberPrincipal`, whose `MemberId` holds the **admin's** id
  when `IsAdmin` is true.
- Rate-limit anything a stranger can call that sends email or SMS, or checks a
  password: `KeyedRateLimiter.IsRateLimited(bucket, key, max, windowMs)`,
  keyed per email **and** per IP, answering `429`. Follow the forgot-password
  actions.
- Build links to the site with `SiteOptions.Page("path")`, never by hand.

## Services and storage

- **Every service is a singleton.** No per-request state in fields, and
  anything mutable must be thread-safe.
- Stores derive from `JsonTableStore<T>`: each record is one JSON string
  property in an Azure Table row. Without a connection string they fall back
  to a JSONL file, then to memory.
- Azure Table caps a string property at 64 KiB (32,768 characters). Records
  are serialised with System.Text.Json's default encoder, which escapes each
  accented character as six characters — keep records small (root
  `AGENTS.md`, open work).
- **Concurrency:** on Azure, conditional writes use the row's ETag. On the
  file and memory fallbacks, only models carrying their own stamp (such as
  `Newsletter.RowVersion`) get conditional writes; every other store is
  last-writer-wins there.
- Settings live in typed Options classes in `Models/Options.cs`, bound from the
  configuration sections in `Program.cs`. Production supplies them as
  UPPER_SNAKE environment variables, mapped in `MapLegacyEnvVars`.

## Accounts and sessions

- A session token is `base64url(payload).base64url(HMAC-SHA256)`, signed with
  `AUTH_TOKEN_SECRET`. The payload carries the account id, email, role, expiry
  and `pv` — the account's `PasswordVersion` when the token was issued.
- **Bumping `PasswordVersion` ends every session of that account.** Each place
  that bumps it is deliberate:
  - self-service change (`MembersController` and `AdminAuthController`
    `change-password`) → responds with a **fresh session**, so the user stays
    signed in;
  - token reset (`reset-password` in `AuthController` and
    `AdminAuthController`) → responds `{ ok: true }`, and the user signs in
    again;
  - an admin resetting **someone else's** password → that person is signed
    out, on purpose.

  A new password flow must pick one of these three.
- Members and admins are separate identities in separate stores, with
  separate tokens and filters.
- Password-reset tokens: the raw token travels only in the email link; the
  store keeps a hash. Tokens are single-use, expire after
  `PasswordResetTtlMinutes`, and a new request invalidates the older ones.
- Passwords are hashed by `PasswordHasher` (PBKDF2-SHA256, 100,000
  iterations). Never store or log them
  in clear. The one exception is the generated seed-admin password, logged
  in Development only.
- **Account existence.** Member forgot-password returns `200 { ok: true }`
  for any address and pads its response time on both paths — keep both.
  Admin forgot-password currently reveals whether an email is an admin
  (`errorType: "not_admin"`); that is an open decision for the owner (root
  `AGENTS.md`, open work). Don't extend it to members, and don't remove it
  unasked.

## Newsletters

The most safety-critical code in the repo: a mistake emails every member.
Pipeline: `AdminNewslettersController` → `NewsletterSender` (who gets it,
batching, SendGrid personalisations) → `NewsletterEmailRenderer` (Markdown to
email HTML and plain text) → SendGrid. Drafting: `NewsletterAiService`
(Anthropic Claude for copy, Unsplash for the cover photo). Members read
newsletters in the portal and unsubscribe via `NewslettersController`.

Invariants — each is there because its absence caused, or nearly caused, a
real bug:

- **Who receives it:** active members who haven't opted out
  (`Member.NewsletterOptOut`). Nobody else, ever.
- **Duplicate sends are blocked three ways:** a persisted send claim with an
  owner stamp (`TryClaimSendAsync`; only its owner releases it), an in-process
  gate per newsletter (`TryEnterSendGate`), and `SendInFlightConflict`, which
  refuses edit, delete, publish and unpublish while a send runs.
- **Test sends:** `testEmails` is cleaned first (`CleanTestEmails`). A list
  that cleans down to nothing is **refused with 400** — never read as "no
  list, so send to everyone". `{"testEmails":[""]}` once mailed the whole
  membership.
- **Sends run from the saved row,** not the editor's contents. That's why the
  editor disables Send while it has unsaved changes.
- **Personalisation tokens** are `%%P46_…%%`. Never use tokens that ordinary
  prose could contain. `…_HTML` variants are HTML-encoded for the HTML part;
  the plain ones have CR/LF removed, because they also go into the Subject
  header (`SanitizeHeader`). Token-like text inside a body is neutralised
  before substitution (`NeutraliseSubstitutionTokens`), so content can't
  inject a member's details.
- **Rendering:** Markdig with `DisableHtml()`, then an AST walker that emits
  only an allow-list of inline-styled elements. Raw HTML from a body never
  reaches an email.
- **Batches:** at most 1000 recipients per SendGrid request (`HardBatchCap`);
  configuration can only lower that. A failed batch is split and retried, and
  failures are recorded, capped at 200 member ids, for "resend to failed".
- **Unsubscribe links** are HMAC-signed with `NEWSLETTER_UNSUBSCRIBE_SECRET`.
  Outside Development, `UnsubscribeTokenService` refuses to sign or accept
  links when that secret is empty or equals a repo default. Keep that check.
  The endpoint always answers 200 with an HTML page, so it never reveals
  whether a member exists.
- **AI drafting** must not invent facts. The system prompt in
  `NewsletterAiService` forbids inventing dates, prices, names, numbers or
  promises. The few facts it may state are written into the prompt; the one
  that changes, the opening year, comes from `SiteFacts`. If you edit the
  prompt, keep those rules. Without `UNSPLASH_ACCESS_KEY`, no cover is chosen — the
  editor shows a keyword instead of a made-up image.

## Email

- `EmailService` sends through SendGrid, with copy from `EmailTranslations` in
  the recipient's preferred language.
- Inline styles only, and HTML-encode every value that came from a person
  (`WebUtility.HtmlEncode`).
- Never put a password or a raw token in an email, except a reset link and
  the credentials an admin chose to send.

## Configuration rules

- **Secrets fail closed outside Development.** Treat empty, and the default
  in `Options.cs`, as "not configured", and disable the feature — never fall
  back to a value that is public in this repository. `UnsubscribeTokenService`
  is the pattern to copy. `TokenService` doesn't follow it yet: root
  `AGENTS.md`, open work item 1.
- `ForwardedHeadersMiddleware` trusts exactly one proxy hop (Azure's ingress)
  and must stay first in the pipeline. Read the client IP only from
  `HttpContext.Connection.RemoteIpAddress`.
- CORS allows `localhost` on any port, `pavillon46.ch` and its subdomains,
  `*.azurestaticapps.net`, and anything in `Cors:AllowedOrigins`.
- A new setting needs four edits: the mapping in `MapLegacyEnvVars`, the
  property in `Options.cs`, `.env.local.example`, and the table in
  `backend/README.md`.

## Known quirks

- `MemberAuthorize` lets any validly signed **admin** token through without
  checking the admin row. Its comment says admin tokens carry `pv = 0`, which
  stopped being true when `CreateForAdmin` started stamping the real version.
  The impact is small — member endpoints resolve the member by id, find none,
  and answer `401` — but a revoked admin token still reaches the endpoints that
  don't load a member. The fix is to reject admin tokens there, once you've
  confirmed nothing relies on them.
- `backend/publish/` (from the CI smoke step) isn't git-ignored. Delete it;
  never commit it.
