import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { admin, jwt } from "better-auth/plugins";
import { pool } from "../db.js";
import { sendEmail } from "../email/index.js";
import { resetPasswordEmail, verificationEmail } from "../email/templates.js";
import { env } from "../env.js";
import { getRegisteredClientOrigins } from "./app-origins.js";

/**
 * Platform administrators: users with the "admin" role, plus anyone listed in
 * ADMIN_EMAILS (so access can never be locked out by a bad role value).
 */
export function isAdminUser(
  user: { role?: string | null; email?: string | null } | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return !!user.email && env.adminEmails.includes(user.email.toLowerCase());
}

export const auth = betterAuth({
  appName: "Authenticize",
  baseURL: env.baseURL,
  secret: env.secret,
  database: pool,

  // Extra origins from env plus the origins of every registered app's
  // redirect URIs — registering an app in the dashboard trusts it instantly.
  trustedOrigins: async () => [
    ...env.trustedOrigins,
    ...(await getRegisteredClientOrigins()),
  ],

  // Invite-only platform: accounts are created from the dashboard
  // (admin createUser bypasses disableSignUp).
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    // Powers both "Forgot password?" and dashboard invites (invites request a
    // reset link with ?invite=1 in the redirect, which switches the template).
    sendResetPassword: async ({ user, url }) => {
      const invite = /invite(=|%3D)1/.test(url);
      await sendEmail({ to: user.email, ...resetPasswordEmail({ url, invite }) });
    },
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({ to: user.email, ...verificationEmail({ url }) });
    },
  },

  socialProviders: {
    ...(env.github.clientId && env.github.clientSecret
      ? {
          github: {
            clientId: env.github.clientId,
            clientSecret: env.github.clientSecret,
          },
        }
      : {}),
    ...(env.google.clientId && env.google.clientSecret
      ? {
          google: {
            clientId: env.google.clientId,
            clientSecret: env.google.clientSecret,
          },
        }
      : {}),
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (env.adminEmails.includes(user.email.toLowerCase())) {
            return { data: { ...user, role: "admin" } };
          }
        },
      },
    },
  },

  plugins: [
    // Signs OAuth access tokens and OIDC id_tokens (RS256 for the widest
    // client-library compatibility) and serves /jwks.
    jwt({
      jwks: {
        keyPairConfig: { alg: "RS256" },
      },
      jwt: {
        // OIDC issuer identifier: the clean public origin. Without this the
        // provider defaults to baseURL + basePath (…/api/auth), which breaks
        // RP issuer validation against the root discovery document.
        issuer: env.baseURL,
      },
    }),

    // Turns this server into an OAuth 2.1 / OIDC provider. Client secrets
    // are stored hashed (default when the jwt plugin is enabled).
    oauthProvider({
      loginPage: "/login",
      consentPage: "/consent",
      // Only platform admins may create/read/update/delete/list/rotate
      // OAuth clients through the session-authenticated endpoints.
      clientPrivileges: async ({ user }) =>
        isAdminUser(user as { role?: string | null; email?: string | null }),
      // Discovery documents are also mounted at the server root (see
      // src/index.ts), which these warnings are about.
      silenceWarnings: {
        openidConfig: true,
        oauthAuthServerConfig: true,
      },
    }),

    // User management for the dashboard: create users, ban, set roles and
    // passwords, list and revoke sessions.
    admin(),
  ],

  ...(env.cookieDomain
    ? {
        advanced: {
          crossSubDomainCookies: {
            enabled: true,
            domain: env.cookieDomain,
          },
        },
      }
    : {}),

  telemetry: {
    enabled: false,
  },
});
