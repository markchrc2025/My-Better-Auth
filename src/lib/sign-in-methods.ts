import { pool } from "../db.js";
import { enabledSocialProviders } from "./social.js";

/**
 * Per-application sign-in method selection (like Firebase's per-project provider
 * toggles). Each connected app can be restricted to a subset of the methods the
 * platform offers; the login page then shows only that app's methods.
 *
 * Vocabulary: "email" (email + password), "passkey", and the social provider
 * ids. Order here is the order the login page renders them.
 */
export const SIGN_IN_METHODS = [
  "email",
  "passkey",
  "google",
  "microsoft",
  "apple",
  "github",
] as const;
export type SignInMethod = (typeof SIGN_IN_METHODS)[number];

/** The social provider ids the platform can broker (everything but email/passkey). */
export const SOCIAL_PROVIDERS = ["google", "microsoft", "apple", "github"] as const;
const SOCIAL = new Set<string>(SOCIAL_PROVIDERS);

/**
 * Methods the platform can offer at all right now: email + passkey are always
 * available; social providers only when their credentials are configured.
 * An app can never enable a method the platform itself doesn't have.
 */
export function globallyAvailableMethods(): SignInMethod[] {
  return SIGN_IN_METHODS.filter(
    (m) => m === "email" || m === "passkey" || enabledSocialProviders.includes(m as never),
  );
}

/** Create the storage table if it doesn't exist (idempotent, run on boot). */
export async function ensureSignInMethodsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "appSignInMethods" (
      "clientId" text PRIMARY KEY,
      "methods" text NOT NULL,
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )
  `);
}

function sanitize(methods: unknown): SignInMethod[] {
  if (!Array.isArray(methods)) return [];
  return SIGN_IN_METHODS.filter((m) => methods.includes(m));
}

/**
 * The app's explicitly chosen methods, or null when it has no override — null
 * means "offer everything the platform has" (the default for every app until an
 * admin narrows it).
 */
export async function getStoredAppMethods(
  clientId: string,
): Promise<SignInMethod[] | null> {
  const res = await pool.query(
    `SELECT methods FROM "appSignInMethods" WHERE "clientId" = $1`,
    [clientId],
  );
  if (res.rowCount === 0) return null;
  try {
    return sanitize(JSON.parse(res.rows[0].methods as string));
  } catch {
    return null;
  }
}

/**
 * What the login page should actually offer for an app: its override (or all,
 * when unset) intersected with what the platform currently supports — so a
 * provider that's since been switched off globally silently drops out.
 */
export async function effectiveAppMethods(
  clientId: string,
): Promise<SignInMethod[]> {
  const available = globallyAvailableMethods();
  const stored = await getStoredAppMethods(clientId);
  const chosen = stored ?? available;
  return available.filter((m) => chosen.includes(m));
}

/** Split a method list into the shape the login page consumes. */
export function toLoginConfig(methods: SignInMethod[]) {
  return {
    email: methods.includes("email"),
    passkey: methods.includes("passkey"),
    social: methods.filter((m) => SOCIAL.has(m)),
  };
}

/** Replace an app's chosen methods. Empty selection is rejected by the caller. */
export async function setAppMethods(
  clientId: string,
  methods: SignInMethod[],
): Promise<SignInMethod[]> {
  const clean = sanitize(methods);
  await pool.query(
    `INSERT INTO "appSignInMethods" ("clientId", "methods", "updatedAt")
     VALUES ($1, $2, now())
     ON CONFLICT ("clientId")
       DO UPDATE SET "methods" = EXCLUDED."methods", "updatedAt" = now()`,
    [clientId, JSON.stringify(clean)],
  );
  return clean;
}
