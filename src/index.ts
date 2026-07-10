import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { adminApi } from "./admin/api.js";
import { ensureAdminUsers } from "./bootstrap.js";
import { pool } from "./db.js";
import { env } from "./env.js";
import { getRegisteredClientOrigins } from "./lib/app-origins.js";
import { auth } from "./lib/auth.js";
import { runMigrationsWithRetry } from "./migrate.js";

const app = new Hono();

// Cross-origin requests from connected apps: origins listed in
// TRUSTED_ORIGINS plus the origins of registered OAuth clients.
app.use(
  "/api/auth/*",
  cors({
    origin: async (origin) => {
      if (!origin) return null;
      if (env.trustedOrigins.includes(origin)) return origin;
      return (await getRegisteredClientOrigins()).includes(origin)
        ? origin
        : null;
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

// OIDC discovery documents at the server root (Better Auth serves them under
// /api/auth as well, but standard clients resolve them from the issuer root).
const openIdConfig = oauthProviderOpenIdConfigMetadata(auth);
const authServerConfig = oauthProviderAuthServerMetadata(auth);
app.get("/.well-known/openid-configuration", (c) => openIdConfig(c.req.raw));
app.get("/.well-known/oauth-authorization-server", (c) =>
  authServerConfig(c.req.raw),
);

// Shallow health check — used by Sliplane to gate deploys and monitor the
// service. Must return 2xx without auth.
app.get("/health", (c) => c.json({ status: "ok" }));

// Deep health check that also verifies database connectivity.
app.get("/health/db", async (c) => {
  try {
    await pool.query("SELECT 1");
    return c.json({ status: "ok", database: "ok" });
  } catch {
    return c.json({ status: "degraded", database: "unreachable" }, 503);
  }
});

// Platform admin API (dashboard backend) — session + admin role required.
app.route("/admin/api", adminApi);

// All Better Auth endpoints: sign-in, sessions, OAuth2/OIDC provider
// (authorize, token, userinfo, ...), admin plugin, JWKS.
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Dashboard SPA (built into ./public). Registered last so API routes above
// take precedence. serveStatic falls through on a missing file, so the second
// handler serves index.html for client-side routes (/apps, /users, ...).
app.use("*", serveStatic({ root: "./public" }));
app.get("*", serveStatic({ path: "./public/index.html" }));

async function main() {
  if (env.autoMigrate) {
    await runMigrationsWithRetry();
  }
  await ensureAdminUsers();

  const server = serve(
    { fetch: app.fetch, port: env.port, hostname: "0.0.0.0" },
    (info) => {
      console.log(`Authenticize listening on http://${info.address}:${info.port}`);
      console.log(`Issuer: ${env.baseURL}`);
    },
  );

  // Graceful shutdown so Sliplane's zero-downtime deploys drain cleanly.
  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
