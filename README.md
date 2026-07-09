# My Better Auth

A standalone [Better Auth](https://better-auth.com) server that acts as the **central authentication service for all of your apps**. Built with [Hono](https://hono.dev) + PostgreSQL, packaged as a small Docker image, and designed to deploy on [Sliplane](https://sliplane.io) in a few clicks.

```
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ app.example.com │   │admin.example.com│   │  www.example.com│   ... your apps
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │      createAuthClient({ baseURL })        │
         └────────────────────┬───────────────────── ┘
                              ▼
                ┌───────────────────────────┐
                │   auth.example.com        │   this repo, deployed as a
                │   (Better Auth + Hono)    │   Sliplane service (public)
                └─────────────┬─────────────┘
                              │  DATABASE_URL → <postgres>.internal:5432
                              ▼
                ┌───────────────────────────┐
                │   PostgreSQL 17           │   Sliplane service (private,
                │   volume-backed           │   Docker image + volume)
                └───────────────────────────┘
```

## How this repo maps to the Better Auth installation guide

| Installation step | Where it lives here |
| --- | --- |
| 1. Install the package | `package.json` — `better-auth` (server), `@better-auth/cli` (dev tooling) |
| 2. Set environment variables | `.env.example` — `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, plus multi-app extras |
| 3. Create a Better Auth instance | `src/lib/auth.ts` — exports `auth` |
| 4. Configure database | `src/db.ts` — PostgreSQL `Pool` (built-in Kysely adapter) |
| 5. Create database tables | Automatic on boot (`src/migrate.ts`), or `npm run migrate` / `npm run auth:migrate` |
| 6. Authentication methods | Email & password enabled; GitHub/Google auto-enable when their env vars are set |
| 7. Mount handler | `src/index.ts` — Hono serves `/api/auth/*` (+ CORS + health checks) |
| 8. Create client instance | Done **in each consuming app** — see [Using it from your apps](#using-it-from-your-apps) |

### Endpoints

| Route | Purpose |
| --- | --- |
| `/api/auth/*` | All Better Auth endpoints (sign-up, sign-in, sessions, OAuth callbacks, ...) |
| `/health` | Shallow health check — configure this as the Sliplane health check route |
| `/health/db` | Deep health check (verifies database connectivity) |
| `/` | Service info |

## Local development

```bash
cp .env.example .env          # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
docker compose up db -d       # PostgreSQL 17 on localhost:5432
npm install
npm run dev                   # http://localhost:3000, migrations run on boot
```

Or run the full stack exactly like production: `docker compose up --build`.

Quick smoke test:

```bash
curl http://localhost:3000/health
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

1. **Create Service** → **Deploy from GitHub** → select `markchrc2025/My-Better-Auth`, branch `main`, context directory `/`. Sliplane detects the `Dockerfile` automatically and picks up the exposed port (3000).
2. Environment variables:

   | Variable | Value |
   | --- | --- |
   | `BETTER_AUTH_SECRET` | output of `openssl rand -base64 32` (mark as secret) |
   | `BETTER_AUTH_URL` | `https://<your-service-name>.sliplane.app` for now |
   | `DATABASE_URL` | `postgres://better_auth:<password>@<postgres-internal-host>:5432/better_auth` |
   | `TRUSTED_ORIGINS` | comma-separated origins of your apps, e.g. `https://app.example.com,https://admin.example.com` |

3. Set the **health check path** to `/health`. Sliplane only routes traffic to a new deploy after this returns 2xx, and keeps monitoring it every minute.
4. Leave **Autodeploy** enabled — every push to the branch redeploys automatically.
5. Deploy. On boot the server connects to Postgres and creates the Better Auth schema (`user`, `session`, `account`, `verification`) automatically — no manual migration step.

Verify: `https://<your-service-name>.sliplane.app/health` → `{"status":"ok"}` and `/health/db` → `{"status":"ok","database":"ok"}`.

### 4. Add a custom domain (strongly recommended for multi-app auth)

To share sessions across your apps, the auth server should live on a subdomain of the same root domain as the apps (e.g. `auth.example.com` next to `app.example.com`):

1. In the service **Settings → Domain → Connect Domain**, add `auth.example.com` and create the CNAME record it shows you. SSL is provisioned automatically via Let's Encrypt.
2. Update env vars: `BETTER_AUTH_URL=https://auth.example.com` and `COOKIE_DOMAIN=.example.com`, then redeploy.

With `COOKIE_DOMAIN` set, the session cookie is issued for the whole root domain, so every `*.example.com` app shares the same login session.

### 5. Configure social providers (optional)

Create OAuth apps and set the callback URL to `https://auth.example.com/api/auth/callback/<provider>`:

- GitHub → set `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
- Google → set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

Providers activate automatically when both values are present. Add more in `src/lib/auth.ts`.

## Using it from your apps

Install the client in each app (`npm install better-auth`), then create a client pointing at this server. Because your apps run on different origins than the auth server, cookies must be sent with `credentials: "include"`:

```ts
// lib/auth-client.ts (React app — use better-auth/vue, /svelte, /solid, or /client for others)
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: "https://auth.example.com", // this auth server
  fetchOptions: { credentials: "include" },
});
```

```ts
// Sign up / sign in / session anywhere in the app
await authClient.signUp.email({ name, email, password });
await authClient.signIn.email({ email, password });
const { data: session } = authClient.useSession(); // React hook
```

Server-side (e.g. an API or SSR backend of one of your apps) — validate the session by forwarding the cookie:

```ts
const res = await fetch("https://auth.example.com/api/auth/get-session", {
  headers: { cookie: request.headers.get("cookie") ?? "" },
});
const session = await res.json(); // null when not signed in
```

Every app origin must be listed in `TRUSTED_ORIGINS`, otherwise CORS and Better Auth will reject its requests.

> **Apps on completely different root domains?** Browsers block third-party cookies, so shared cookie sessions only work across subdomains of one root domain. For separate domains, add the [Bearer plugin](https://better-auth.com/docs/plugins/bearer) (token in `Authorization` header) or turn this server into a full [OIDC provider](https://better-auth.com/docs/plugins/oidc-provider). For mobile, see the [Expo plugin](https://better-auth.com/docs/integrations/expo).

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | ✅ | ≥32-char secret for hashing/encryption/signing (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | ✅ | Public base URL of this auth server |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `TRUSTED_ORIGINS` | for multi-app | Comma-separated origins allowed to use this server (CORS + trustedOrigins) |
| `COOKIE_DOMAIN` | recommended | e.g. `.example.com` — share the session cookie across all subdomains |
| `AUTO_MIGRATE` | – | `false` to skip schema migration on boot (default `true`) |
| `PORT` | – | Listen port (default `3000`) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | – | Enable GitHub sign-in |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | – | Enable Google sign-in |

## Operations

- **Schema changes** (new plugins, etc.): migrations run automatically on the next deploy. Manually: `npm run migrate` (programmatic) or `npm run auth:migrate` (Better Auth CLI).
- **Rotate the secret**: switch to `BETTER_AUTH_SECRETS` (plural) to roll over without invalidating existing data — see the [secrets option](https://better-auth.com/docs/reference/options#secrets).
- **Add auth methods**: edit `src/lib/auth.ts` (e.g. [passkey](https://better-auth.com/docs/plugins/passkey), [magic link](https://better-auth.com/docs/plugins/magic-link), [username](https://better-auth.com/docs/plugins/username)) and push — Sliplane redeploys and migrations apply on boot.
