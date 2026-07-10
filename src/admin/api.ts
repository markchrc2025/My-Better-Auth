import { APIError } from "better-auth/api";
import { Hono } from "hono";
import { pool } from "../db.js";
import { emailConfigured } from "../email/index.js";
import { env } from "../env.js";
import {
  invalidateClientOriginsCache,
  parseStringArray,
} from "../lib/app-origins.js";
import { auth, isAdminUser } from "../lib/auth.js";

/**
 * Platform admin API consumed by the dashboard. Everything here requires an
 * authenticated session with admin access; the Better Auth endpoints called
 * underneath additionally enforce their own permission checks.
 */
export const adminApi = new Hono();

adminApi.onError((err, c) => {
  if (err instanceof APIError) {
    const status = typeof err.statusCode === "number" ? err.statusCode : 500;
    const body =
      err.body && typeof err.body === "object"
        ? err.body
        : { message: err.message };
    return c.json(body, status as never);
  }
  console.error("[admin-api] Unhandled error:", err);
  return c.json({ message: "Internal server error" }, 500);
});

adminApi.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session || !isAdminUser(session.user)) {
    return c.json({ message: "Admin access required" }, 403);
  }
  await next();
});

adminApi.get("/stats", async (c) => {
  const [users, sessions, apps] = await Promise.all([
    pool.query(`SELECT count(*)::int AS n FROM "user"`),
    pool.query(`SELECT count(*)::int AS n FROM "session" WHERE "expiresAt" > now()`),
    pool.query(`SELECT count(*)::int AS n FROM "oauthClient"`),
  ]);
  return c.json({
    users: users.rows[0].n,
    activeSessions: sessions.rows[0].n,
    apps: apps.rows[0].n,
  });
});

adminApi.get("/config", (c) =>
  c.json({
    issuer: env.baseURL,
    discovery: `${env.baseURL}/.well-known/openid-configuration`,
    authBasePath: "/api/auth",
    inviteOnly: true,
    cookieDomain: env.cookieDomain ?? null,
    emailConfigured: emailConfigured(),
    emailProvider: env.email.provider || null,
    socialAllowSignup: env.socialAllowSignup,
    socialProviders: {
      google: Boolean(env.google.clientId && env.google.clientSecret),
      microsoft: Boolean(env.microsoft.clientId && env.microsoft.clientSecret),
      github: Boolean(env.github.clientId && env.github.clientSecret),
    },
  }),
);

function mapClientRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name ?? null,
    type: row.type ?? "web",
    redirectUris: parseStringArray(row.redirectUris),
    postLogoutRedirectUris: parseStringArray(row.postLogoutRedirectUris),
    scopes: parseStringArray(row.scopes),
    grantTypes: parseStringArray(row.grantTypes),
    disabled: Boolean(row.disabled),
    skipConsent: Boolean(row.skipConsent),
    userCount: Number(row.userCount ?? 0),
    lastUsedAt: row.lastUsedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// List all registered apps. Read directly from the database: the Better Auth
// list endpoint scopes to the session user, but platform apps are created
// ownerless via the server-only admin endpoint. Per-app usage is derived from
// issued tokens (skip-consent apps never write consent rows) unioned with
// consents (for apps that show the consent screen).
adminApi.get("/apps", async (c) => {
  const res = await pool.query(
    `SELECT c.id, c."clientId", c.name, c.type, c."redirectUris",
            c."postLogoutRedirectUris", c.scopes, c."grantTypes", c.disabled,
            c."skipConsent", c."createdAt", c."updatedAt",
            COALESCE(a."userCount", 0)::int AS "userCount",
            a."lastUsedAt"
     FROM "oauthClient" c
     LEFT JOIN (
       SELECT "clientId",
              count(DISTINCT "userId")::int AS "userCount",
              max("createdAt") AS "lastUsedAt"
       FROM (
         SELECT "clientId", "userId", "createdAt"
           FROM "oauthAccessToken" WHERE "userId" IS NOT NULL
         UNION ALL
         SELECT "clientId", "userId", "createdAt"
           FROM "oauthConsent" WHERE "userId" IS NOT NULL
       ) usage_rows
       GROUP BY "clientId"
     ) a ON a."clientId" = c."clientId"
     ORDER BY c."createdAt" DESC NULLS LAST`,
  );
  return c.json({ apps: res.rows.map(mapClientRow) });
});

// Register a new app. Returns the client credentials — the client_secret is
// only ever returned by this response (stored hashed).
adminApi.post("/apps", async (c) => {
  const body = await c.req.json<{
    name?: string;
    redirect_uris?: string[];
    type?: "web" | "native" | "user-agent-based";
    skip_consent?: boolean;
    scope?: string;
    grant_types?: ("authorization_code" | "client_credentials" | "refresh_token")[];
    client_uri?: string;
    logo_uri?: string;
    post_logout_redirect_uris?: string[];
  }>();

  if (!body.name?.trim()) {
    return c.json({ message: "name is required" }, 400);
  }
  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
    return c.json({ message: "redirect_uris must be a non-empty array" }, 400);
  }

  const type = body.type ?? "web";
  // Even the server-only admin endpoint runs assertClientPrivileges, so the
  // admin's session headers must be forwarded.
  const created = await auth.api.adminCreateOAuthClient({
    headers: c.req.raw.headers,
    body: {
      client_name: body.name.trim(),
      redirect_uris: body.redirect_uris,
      type,
      // Public clients (SPA/native) authenticate with PKCE only.
      token_endpoint_auth_method: type === "web" ? "client_secret_basic" : "none",
      // First-party apps skip the consent screen by default.
      skip_consent: body.skip_consent ?? true,
      ...(body.scope ? { scope: body.scope } : {}),
      ...(body.grant_types ? { grant_types: body.grant_types } : {}),
      ...(body.client_uri ? { client_uri: body.client_uri } : {}),
      ...(body.logo_uri ? { logo_uri: body.logo_uri } : {}),
      ...(body.post_logout_redirect_uris
        ? { post_logout_redirect_uris: body.post_logout_redirect_uris }
        : {}),
    },
  });
  invalidateClientOriginsCache();
  return c.json(created, 201);
});

// Identities that have completed a sign-in through an app, most recent first.
adminApi.get("/apps/:clientId/users", async (c) => {
  const res = await pool.query(
    `SELECT u.id, u.email, u.name, u.role, u.banned,
            count(t.*)::int AS "signInCount",
            max(t."createdAt") AS "lastSignInAt"
     FROM "oauthAccessToken" t
     JOIN "user" u ON u.id = t."userId"
     WHERE t."clientId" = $1
     GROUP BY u.id, u.email, u.name, u.role, u.banned
     ORDER BY max(t."createdAt") DESC`,
    [c.req.param("clientId")],
  );
  return c.json({ users: res.rows });
});

// Sign-in methods registered per identity (credential = email/password;
// other providerIds are social/SSO logins into the platform itself).
adminApi.get("/users/auth-methods", async (c) => {
  const res = await pool.query(
    `SELECT "userId", array_agg(DISTINCT "providerId") AS providers
     FROM account GROUP BY "userId"`,
  );
  const methods: Record<string, string[]> = {};
  for (const row of res.rows) {
    methods[row.userId as string] = row.providers as string[];
  }
  return c.json({ methods });
});

// Update app settings (name, redirect URIs, consent behavior, ...).
adminApi.patch("/apps/:clientId", async (c) => {
  const update = await c.req.json<Record<string, unknown>>();
  const updated = await auth.api.adminUpdateOAuthClient({
    headers: c.req.raw.headers,
    body: {
      client_id: c.req.param("clientId"),
      update,
    },
  });
  invalidateClientOriginsCache();
  return c.json(updated);
});

// Enable/disable an app without deleting it. (Not part of the plugin's
// update schema, so toggled directly.)
adminApi.post("/apps/:clientId/disabled", async (c) => {
  const { disabled } = await c.req.json<{ disabled?: boolean }>();
  if (typeof disabled !== "boolean") {
    return c.json({ message: "disabled must be a boolean" }, 400);
  }
  const res = await pool.query(
    `UPDATE "oauthClient" SET disabled = $1, "updatedAt" = now()
     WHERE "clientId" = $2 RETURNING "clientId"`,
    [disabled, c.req.param("clientId")],
  );
  if (res.rowCount === 0) {
    return c.json({ message: "Unknown client" }, 404);
  }
  invalidateClientOriginsCache();
  return c.json({ clientId: c.req.param("clientId"), disabled });
});

// Rotate the client secret. Returns the new secret — shown once.
adminApi.post("/apps/:clientId/rotate-secret", async (c) => {
  const rotated = await auth.api.rotateClientSecret({
    body: { client_id: c.req.param("clientId") },
    headers: c.req.raw.headers,
  });
  return c.json(rotated);
});

adminApi.delete("/apps/:clientId", async (c) => {
  await auth.api.deleteOAuthClient({
    body: { client_id: c.req.param("clientId") },
    headers: c.req.raw.headers,
  });
  invalidateClientOriginsCache();
  return c.json({ deleted: true });
});
