import { env } from "../env.js";

/**
 * Social providers Authenticize can broker, in the order the login page shows
 * them. A provider is "enabled" only when its client id and secret are both
 * configured. The string ids match Better Auth's provider ids and its
 * /api/auth/callback/{id} paths.
 */
export type SocialProviderId = "google" | "microsoft" | "apple" | "github";

const CONFIGURED: Record<SocialProviderId, boolean> = {
  google: Boolean(env.google.clientId && env.google.clientSecret),
  microsoft: Boolean(env.microsoft.clientId && env.microsoft.clientSecret),
  apple: Boolean(env.apple.clientId && env.apple.clientSecret),
  github: Boolean(env.github.clientId && env.github.clientSecret),
};

/** Enabled provider ids in display order (Google, Microsoft, Apple, GitHub). */
export const enabledSocialProviders: SocialProviderId[] = (
  ["google", "microsoft", "apple", "github"] as const
).filter((id) => CONFIGURED[id]);

/**
 * Build the `socialProviders` config for betterAuth.
 *
 * `disableImplicitSignUp: true` (the invite-only default) makes a social login
 * link to an existing invited account but refuse to create a new one — the
 * callback returns `error=signup_disabled` for an unknown identity. Flip it via
 * SOCIAL_ALLOW_SIGNUP=true to let social identities self-provision.
 */
export function buildSocialProviders() {
  const disableImplicitSignUp = !env.socialAllowSignup;
  const providers: Record<string, Record<string, unknown>> = {};

  if (CONFIGURED.google) {
    providers.google = {
      clientId: env.google.clientId,
      clientSecret: env.google.clientSecret,
      disableImplicitSignUp,
    };
  }
  if (CONFIGURED.microsoft) {
    providers.microsoft = {
      clientId: env.microsoft.clientId,
      clientSecret: env.microsoft.clientSecret,
      ...(env.microsoft.tenantId ? { tenantId: env.microsoft.tenantId } : {}),
      disableImplicitSignUp,
    };
  }
  if (CONFIGURED.apple) {
    providers.apple = {
      clientId: env.apple.clientId,
      clientSecret: env.apple.clientSecret,
      ...(env.apple.appBundleIdentifier
        ? { appBundleIdentifier: env.apple.appBundleIdentifier }
        : {}),
      disableImplicitSignUp,
    };
  }
  if (CONFIGURED.github) {
    providers.github = {
      clientId: env.github.clientId,
      clientSecret: env.github.clientSecret,
      disableImplicitSignUp,
    };
  }

  return providers;
}
