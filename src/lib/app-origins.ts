import { pool } from "../db.js";

/**
 * better-auth stores `string[]` fields as JSON text in SQL databases; be
 * lenient and accept real arrays, JSON strings, or comma-separated strings.
 */
export function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.length > 0) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // fall through to comma-split
    }
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

let cache: { at: number; origins: string[] } = { at: 0, origins: [] };
const TTL_MS = 30_000;

/**
 * Origins derived from the redirect URIs of every enabled OAuth client.
 * Registering an app in the dashboard automatically trusts its origin for
 * CORS and Better Auth origin checks. Cached briefly; the admin API
 * invalidates the cache on any client mutation.
 */
export async function getRegisteredClientOrigins(): Promise<string[]> {
  if (Date.now() - cache.at < TTL_MS) return cache.origins;
  try {
    const res = await pool.query(
      `SELECT "redirectUris" FROM "oauthClient" WHERE COALESCE(disabled, false) = false`,
    );
    const origins = new Set<string>();
    for (const row of res.rows) {
      for (const uri of parseStringArray(row.redirectUris)) {
        try {
          origins.add(new URL(uri).origin);
        } catch {
          // ignore unparseable redirect URIs
        }
      }
    }
    cache = { at: Date.now(), origins: [...origins] };
  } catch {
    // Table may not exist yet (before first migration) — serve stale/empty
    // rather than failing the request.
  }
  return cache.origins;
}

export function invalidateClientOriginsCache(): void {
  cache = { at: 0, origins: cache.origins };
}

/** Redirect URIs registered for a single client, or [] if it doesn't exist. */
export async function getClientRedirectUris(clientId: string): Promise<string[]> {
  try {
    const res = await pool.query(
      `SELECT "redirectUris" FROM "oauthClient" WHERE "clientId" = $1`,
      [clientId],
    );
    if (res.rowCount === 0) return [];
    return parseStringArray(res.rows[0].redirectUris);
  } catch {
    return [];
  }
}

/**
 * Does a requested redirect_uri match one of the registered ones, using the
 * same rule the OAuth provider enforces: exact string match, except loopback
 * addresses (localhost/127.0.0.1) may differ only in port (RFC 8252).
 */
export function redirectUriMatches(
  registered: string[],
  requested: string,
): boolean {
  return registered.some((reg) => {
    if (reg === requested) return true;
    try {
      const r = new URL(reg);
      const q = new URL(requested);
      const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(
        r.hostname,
      );
      return (
        loopback &&
        r.hostname === q.hostname &&
        r.pathname === q.pathname &&
        r.protocol === q.protocol &&
        r.search === q.search
      );
    } catch {
      return false;
    }
  });
}
