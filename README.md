# Authenticize

A personal **authentication platform** built on [Better Auth](https://better-auth.com): a standalone server that acts as a full **OAuth 2.1 / OIDC provider** for all of your apps — each app connects with generated `client_id`/`client_secret` credentials, like your own private Auth0. Invite-only (public sign-up is disabled; accounts are created by an admin), built with [Hono](https://hono.dev) + PostgreSQL, packaged as a small Docker image, and designed to deploy on [Sliplane](https://sliplane.io) in a few clicks.

```
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│    App A        │   │    App B        │   │    App C        │   ... your apps
│ (any domain)    │   │ (any domain)    │   │ (any domain)    │
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │   OAuth 2.1 / OIDC (auth code + PKCE)      │
         │   client_id / client_secret per app       │
         └────────────────────┬──────────────────────┘
                              ▼
                ┌───────────────────────────┐
                │   auth.example.com        │   this repo, deployed as a
                │   OIDC provider + Hono    │   single Sliplane service:
                │   + admin dashboard (SPA) │   API + dashboard, one origin
                └─────────────┬─────────────┘
                              │  DATABASE_URL → <postgres>.internal:5432
                              ▼
                ┌───────────────────────────┐
                │   PostgreSQL 17           │   Sliplane service (private,
                │   volume-backed           │   Docker image + volume)
                └───────────────────────────┘
```

You administer everything from the built-in **dashboard** (served at the root
of the auth server): create users, and connect apps to get their OAuth
credentials and copy-paste setup snippets — no terminal needed.

## How this repo maps to the Better Auth installation guide

| Installation step | Where it lives here |
| --- | --- |
| 1. Install the package | `package.json` — `better-auth` (server), `@better-auth/cli` (dev tooling) |
| 2. Set environment variables | `.env.example` — `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, plus multi-app extras |
| 3. Create a Better Auth instance | `src/lib/auth.ts` — exports `auth` |
| 4. Configure database | `src/db.ts` — PostgreSQL `Pool` (built-in Kysely adapter) |
| 5. Create database tables | Automatic on boot (`src/migrate.ts`), or `npm run migrate` / `npm run auth:migrate` |
| 6. Authentication methods | Email & password enabled; Google / Microsoft / GitHub sign-in auto-enable when their env vars are set |
| 7. Mount handler | `src/index.ts` — Hono serves `/api/auth/*` (+ CORS + health checks) |
| 8. Create client instance | Each app connects over **OIDC** with generated credentials — see [Connecting your apps](#connecting-your-apps) |

### Endpoints

| Route | Purpose |
| --- | --- |
| `/.well-known/openid-configuration` | OIDC discovery document (also under `/api/auth`) |
| `/.well-known/oauth-authorization-server` | OAuth 2.1 server metadata |
| `/api/auth/oauth2/authorize` · `token` · `userinfo` · `introspect` · `revoke` | The OIDC provider endpoints your apps use |
| `/api/auth/jwks` | RS256 signing keys (JWKS) |
| `/api/auth/*` | Core Better Auth endpoints (sign-in, sessions, admin plugin, ...) |
| `/admin/api/*` | Platform admin API (stats, config, app registry) — admin session required |
| `/health` | Shallow health check — configure this as the Sliplane health check route |
| `/health/db` | Deep health check (verifies database connectivity) |
| `/` · `/apps` · `/users` · `/settings` | Admin dashboard (React SPA) |

## The admin dashboard

The dashboard (`web/`, a React + Vite SPA) is built into the server image and
served from the root path — locked to accounts in `ADMIN_EMAILS`. From it you can:

- **Overview** — user/app/session counts, issuer + discovery URLs, DB health.
- **Applications** — connect an app (web, SPA, or native), which generates its
  `client_id`/`client_secret` and shows ready-to-paste endpoint URLs, an env-var
  block, and framework snippets (Next.js/Auth.js, Node `openid-client`, browser
  PKCE). Edit redirect URIs, disable, delete, rotate the secret, or choose its
  **sign-in methods** (see below) later.
- **Users** — create users (the "invite"), search, set roles, ban/unban, reset
  passwords, and list/revoke sessions.
- **Security** — turn on two-factor and register passkeys for your own account
  (see below).
- **Settings** — read-only view of issuer, sign-up mode, cookie domain, and which
  social providers are active.

## Account security: two-factor & passkeys

Every account can harden its own sign-in from the dashboard's **Security** page:

- **Two-factor (TOTP)** — scan a QR with any authenticator app (Google
  Authenticator, Microsoft Authenticator, 1Password, …) and confirm a code.
  Enabling requires your password *and* a valid code, so a mis-scanned QR can't
  lock you out, and one-time **backup codes** are shown once for recovery. After
  it's on, password sign-in asks for the 6-digit code (or a backup code).
- **Passkeys** — register a device passkey (Face ID, Touch ID, Windows Hello, a
  security key). The login page then offers **Sign in with a passkey**, so you
  can skip the password entirely.

Passkeys are bound to a domain (the "relying party id"). By default that's the
auth server's own hostname, derived from `BETTER_AUTH_URL`; set `PASSKEY_RP_ID`
to a parent domain (e.g. `example.com`) to share passkeys across its subdomains.
Passkeys require a secure context — they work on `localhost` and over HTTPS.

## Local development

```bash
cp .env.example .env          # set BETTER_AUTH_SECRET (openssl rand -base64 32)
                              # and ADMIN_EMAILS + ADMIN_INITIAL_PASSWORD
docker compose up db -d       # PostgreSQL 17 on localhost:5432
npm install
npm run dev                   # auth server + API on http://localhost:3000

# In a second terminal, the dashboard dev server (proxies /api to :3000):
cd web && npm install && npm run dev   # http://localhost:5173
```

Or run the full stack exactly like production (dashboard built into the image):
`docker compose up --build`, then open http://localhost:3000 and sign in with
`ADMIN_EMAILS` / `ADMIN_INITIAL_PASSWORD`.

Quick API smoke test:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/.well-known/openid-configuration
# Public sign-up is disabled (invite-only) — this returns a 4xx by design:
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","password":"SuperSecret123!"}'
```

## Deploying on Sliplane

Sliplane deploys Docker workloads onto servers you rent, with automatic HTTPS, health-checked zero-downtime deploys, and deploy-on-push from GitHub. You'll create **two services in one project**: a private PostgreSQL service and this auth server.

### 1. Create a project and server

Sign in at [sliplane.io](https://sliplane.io) (GitHub login), create a **Project** (e.g. `auth`), and add a **Server** — the smallest instance is plenty to start.

### 2. Deploy PostgreSQL (private service)

1. **Create Service** → **Deploy from Docker Image** → image `postgres:17`.
2. Environment variables:
   - `POSTGRES_USER` = `better_auth`
   - `POSTGRES_PASSWORD` = a strong generated password
   - `POSTGRES_DB` = `better_auth`
3. Add a **Volume** mounted at `/var/lib/postgresql/data` (this is what makes the database survive restarts and redeploys).
4. Make the service **private** (not publicly exposed). Postgres speaks TCP, not HTTP, so it should only be reachable over Sliplane's internal network.
5. Deploy, then copy the **internal host** from the service settings (looks like `postgres-xxxx.internal`).

### 3. Deploy this repo (public service)

1. **Create Service** → **Deploy from GitHub** → select `markchrc2025/Authenticize`, branch `main`, context directory `/`. Sliplane detects the `Dockerfile` automatically and picks up the exposed port (3000).
2. Environment variables:

   | Variable | Value |
   | --- | --- |
   | `BETTER_AUTH_SECRET` | output of `openssl rand -base64 32` (mark as secret) |
   | `BETTER_AUTH_URL` | `https://<your-service-name>.sliplane.app` for now |
   | `DATABASE_URL` | `postgres://better_auth:<password>@<postgres-internal-host>:5432/better_auth` |
   | `ADMIN_EMAILS` | your email(s), comma-separated — grants dashboard access |
   | `ADMIN_INITIAL_PASSWORD` | a strong password (mark as secret) — creates your admin account on first boot |

3. Set the **health check path** to `/health`. Sliplane only routes traffic to a new deploy after this returns 2xx, and keeps monitoring it every minute.
4. Leave **Autodeploy** enabled — every push to the branch redeploys automatically.
5. Deploy. On boot the server connects to Postgres, creates the full schema (core + OIDC + JWKS tables) automatically, and creates your admin account.

Verify: open `https://<your-service-name>.sliplane.app/` → sign in with `ADMIN_EMAILS` / `ADMIN_INITIAL_PASSWORD`, then **change your password** (Users → your account) and remove `ADMIN_INITIAL_PASSWORD` from the env vars.

> `TRUSTED_ORIGINS` is optional here: the origins of each connected app's redirect URIs are trusted automatically. Set it only for extra origins that aren't OAuth clients.

### 4. Add a custom domain (recommended)

A stable custom domain keeps your OIDC issuer URL constant (apps pin it), and gives you a memorable dashboard URL:

1. In the service **Settings → Domain → Connect Domain**, add `auth.example.com` and create the CNAME record it shows you. SSL is provisioned automatically via Let's Encrypt.
2. Update `BETTER_AUTH_URL=https://auth.example.com` and redeploy. (Since apps connect over OIDC, they work across any domain — no shared-cookie configuration needed. If you *also* want browser-cookie SSO across subdomains of one root domain, additionally set `COOKIE_DOMAIN=.example.com`.)

### 5. Configure social sign-in (Google / Microsoft / Apple / GitHub)

Authenticize can broker Google, Microsoft, Apple, and GitHub. When a provider is
configured, a **"Continue with …"** button appears on the login page — both for
signing into the dashboard and for apps signing in through the OIDC flow
(Authenticize proves the identity; each app still authorizes from its own
tables). Create an OAuth app with each provider and set its callback URL to
`https://auth.example.com/api/auth/callback/<provider>`:

- **Google** → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
  (callback `…/api/auth/callback/google`)
- **Microsoft** (Entra / Azure AD) → `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`,
  optional `MICROSOFT_TENANT_ID` (callback `…/api/auth/callback/microsoft`).
  Leave the tenant empty for `common` (work/school + personal accounts) or set a
  tenant GUID to restrict to your organization.
- **Apple** → `APPLE_CLIENT_ID` (your **Services ID**) / `APPLE_CLIENT_SECRET`
  (callback `…/api/auth/callback/apple`). Apple's secret is a short-lived ES256
  JWT, not a static string — generate it from your `.p8` key with
  **`npm run apple:secret`** (see below) and regenerate before it expires
  (≤ 6 months). Apple posts its callback back as a form (`form_post`); this works
  out of the box because state is stored server-side. Note: users who pick
  "Hide My Email" arrive with a private relay address, so in invite-only mode
  they'll only match an invite made to that relay address.
- **GitHub** → `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
  (callback `…/api/auth/callback/github`)

A provider activates automatically when both its id and secret are present.

**Generating the Apple client secret:**

```bash
APPLE_TEAM_ID=ABCDE12345 \
APPLE_KEY_ID=KEY1234567 \
APPLE_CLIENT_ID=com.yourcompany.auth \        # your Services ID
APPLE_PRIVATE_KEY_PATH=./AuthKey_KEY1234567.p8 \
npm run apple:secret                          # prints the JWT → set as APPLE_CLIENT_SECRET
```

**Invite-only vs. open-broker.** Two modes, one env var:

- **Invite-only** (default): a social sign-in *links* to an account that was
  already invited with that email — it does **not** create a new one. An
  uninvited user is turned away with "this account isn't invited yet."
- **Open-broker** (`SOCIAL_ALLOW_SIGNUP=true`): any Google/Microsoft/Apple/GitHub
  identity self-provisions a plain, **non-admin** account on first sign-in.
  Authenticize acts as a pure identity broker and each connected app does the
  real gatekeeping from its own tables. This is the mode to use when apps bring
  their own user directories.

Either way, **management accounts can never sign into a connected app**, and the
dashboard itself stays invite-only email/password (social self-sign-up never
grants admin).

### Per-app sign-in methods

Providers are configured once at the platform level, but each app chooses which
of them it offers — like Firebase's per-project provider toggles. Open an app in
the dashboard → **Sign-in methods** and toggle email/password, passkeys, and each
social provider. The Authenticize login page then shows only that app's methods
when a user signs in through it, and a provider an app hasn't enabled is refused
server-side even for a hand-crafted request. A new app offers everything
available until you narrow it, and only providers configured platform-wide can be
turned on. The dashboard login (no app) always offers every available method.

### One-click provider brokering (`provider_hint`)

An app that wants its *own* "Continue with Google/Microsoft" buttons — rather
than a single "Continue with Authenticize" button — can add
`?provider_hint=<provider>` to its `/oauth2/authorize` request. Authenticize
then skips its own sign-in page and bounces straight to that provider, so the
brokering is invisible to the app's users. The hint is honoured only when the
provider is enabled for that app; otherwise the normal login page is shown. The
app still holds no provider secrets, and Authenticize still just proves the
identity — the app authorizes the resulting email from its own tables. (Sentire
Payroll's tenant login uses this for its three SSO buttons.)

## Connecting your apps

Each app connects as a standard **OIDC client**. You don't hand-edit anything on
the server — you register the app in the dashboard and paste the generated values.

1. In the dashboard → **Applications** → **Connect an app**. Give it a name, add
   its redirect URI (e.g. `https://app.example.com/api/auth/callback/authenticize`),
   and pick a type:
   - **Web app** (has a backend) → gets a `client_id` **and** `client_secret`.
   - **SPA / Native** → public client, `client_id` only (PKCE, no secret).
2. Copy the credentials and the connection details shown (the secret is displayed
   **once**). The modal includes copy-paste snippets for Next.js/Auth.js, Node
   `openid-client`, and browser PKCE.
3. Point your app's OIDC/auth library at the **issuer** (`https://auth.example.com`)
   — its discovery document at `/.well-known/openid-configuration` advertises every
   endpoint automatically.

Minimal example (Auth.js / NextAuth v5):

```ts
// auth.ts
import NextAuth from "next-auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: "authenticize",
      name: "Authenticize",
      type: "oidc",
      issuer: "https://auth.example.com",
      clientId: process.env.OIDC_CLIENT_ID!,
      clientSecret: process.env.OIDC_CLIENT_SECRET!, // omit for public SPA/native clients
    },
  ],
});
```

Because this is real OIDC (authorization code + PKCE, RS256-signed tokens
verifiable via the JWKS endpoint), your apps can live on **any domain** — no
shared-cookie or same-origin requirement.

> Users sign in on this server's hosted **login page** (and a **consent** screen,
> unless you enabled "skip consent" for a first-party app), then get redirected
> back to your app with an authorization code. Since the platform is invite-only,
> create each user in the dashboard first.

## Email (password resets, invites, verification)

The **auth server sends all identity emails** — password resets, "set your
password" invites when you create users, and email verification. (Your apps
send their own business email — payslips, notifications — separately; one
Resend account with an API key per app works well.)

Two pluggable providers, chosen by `EMAIL_PROVIDER`:

- **`resend`** — [Resend](https://resend.com) HTTP API. Setup: create an
  account → verify your domain (DNS records they show you) → create an API
  key → set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and
  `EMAIL_FROM=Auth <auth@yourdomain.com>`. Free tier: 3,000 emails/month.
- **`smtp`** — any SMTP relay via nodemailer. This is the **Amazon SES
  migration path**: create SES SMTP credentials and set
  `EMAIL_PROVIDER=smtp`, `SMTP_HOST=email-smtp.<region>.amazonaws.com`,
  `SMTP_PORT=587`, `SMTP_USER`/`SMTP_PASS`. Switching from Resend to SES is
  purely an env-var change — no code. (Also works with Gmail app passwords.)

Until email is configured, everything else works; the dashboard hides
invite/reset buttons and the "Forgot password?" flow reports that email isn't
set up. With it configured:

- Login page gains a working **Forgot password?** flow (public `/forgot-password`
  and `/reset-password` pages, 1-hour token, single-use).
- **Create user** in the dashboard can email the person a "set your own
  password" invite link instead of you sharing a temp password.
- Each user's management modal gets an **Email reset link** button.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | ✅ | ≥32-char secret for hashing/encryption/signing (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | ✅ | Public base URL of this auth server |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `ADMIN_EMAILS` | ✅ | Comma-separated emails of platform administrators (dashboard access) |
| `ADMIN_INITIAL_PASSWORD` | first boot | Creates the first admin account if it doesn't exist; change the password after first login, then remove. (No effect if the account already exists.) |
| `ADMIN_RESET_PASSWORD` | if locked out | While set, force-resets every `ADMIN_EMAILS` account's password on each boot. Set it, redeploy, sign in, then **remove it**. |
| `TRUSTED_ORIGINS` | optional | Extra allowed origins (CORS + trustedOrigins). Connected apps' redirect-URI origins are trusted automatically. |
| `COOKIE_DOMAIN` | optional | e.g. `.example.com` — share the browser session cookie across subdomains (not needed for OIDC) |
| `EMAIL_PROVIDER` | for email | `resend` or `smtp` (empty = email features off) |
| `EMAIL_FROM` | for email | Sender, e.g. `Authenticize <auth@yourdomain.com>` |
| `RESEND_API_KEY` | provider=resend | Resend API key |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_SECURE` | provider=smtp | SMTP relay (Amazon SES, Gmail, ...) |
| `AUTO_MIGRATE` | – | `false` to skip schema migration on boot (default `true`) |
| `PORT` | – | Listen port (default `3000`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | – | Enable Google sign-in |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | – | Enable Microsoft (Entra/Azure AD) sign-in |
| `MICROSOFT_TENANT_ID` | optional | Entra tenant GUID; empty = `common` (work/school + personal) |
| `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET` | – | Enable Apple sign-in. id = Services ID; secret = JWT from `npm run apple:secret` |
| `APPLE_APP_BUNDLE_IDENTIFIER` | optional | Native app bundle id (id_token audience) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | – | Enable GitHub sign-in |
| `SOCIAL_ALLOW_SIGNUP` | – | `true` = open-broker (any social identity self-provisions a non-admin account); default `false` (invite-only linking) |
| `PASSKEY_RP_ID` | optional | WebAuthn relying-party id; defaults to the auth server's hostname. Set a parent domain to share passkeys across subdomains |

## Operations

- **Dashboard build**: the SPA in `web/` is compiled into the server image (`web-build` stage in the `Dockerfile`) and served from `./public`. Rebuild locally with `cd web && npm run build`.
- **Schema changes** (new plugins, etc.): migrations run automatically on the next deploy. Manually: `npm run migrate` (programmatic) or `npm run auth:migrate` (Better Auth CLI).
- **Rotate the secret**: switch to `BETTER_AUTH_SECRETS` (plural) to roll over without invalidating existing data — see the [secrets option](https://better-auth.com/docs/reference/options#secrets).
- **Add auth methods**: edit `src/lib/auth.ts` (e.g. [passkey](https://better-auth.com/docs/plugins/passkey), [magic link](https://better-auth.com/docs/plugins/magic-link), [username](https://better-auth.com/docs/plugins/username)) and push — Sliplane redeploys and migrations apply on boot.
