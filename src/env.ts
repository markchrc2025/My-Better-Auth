import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function csv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const secret = required("BETTER_AUTH_SECRET");
if (secret.length < 32) {
  console.warn(
    "[env] BETTER_AUTH_SECRET should be at least 32 characters. Generate one with: openssl rand -base64 32",
  );
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret,
  databaseUrl: required("DATABASE_URL"),
  trustedOrigins: csv(process.env.TRUSTED_ORIGINS),
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  autoMigrate: (process.env.AUTO_MIGRATE ?? "true").toLowerCase() !== "false",

  // Emails allowed to administer the platform (dashboard + admin APIs).
  // The first entry is created automatically on first boot when
  // ADMIN_INITIAL_PASSWORD is set.
  adminEmails: csv(process.env.ADMIN_EMAILS).map((e) => e.toLowerCase()),
  adminInitialPassword: process.env.ADMIN_INITIAL_PASSWORD || undefined,
  // Escape hatch: when set, force-resets the password of existing admin
  // accounts on boot (use it if you're locked out). Remove it afterwards.
  adminResetPassword: process.env.ADMIN_RESET_PASSWORD || undefined,

  // Outbound email. provider: "resend" (HTTP API) or "smtp" (nodemailer —
  // covers Amazon SES, Gmail, or any relay). Unset = email features disabled.
  email: {
    provider: (process.env.EMAIL_PROVIDER ?? "").toLowerCase() as
      | "resend"
      | "smtp"
      | "",
    from: process.env.EMAIL_FROM || undefined,
    resendApiKey: process.env.RESEND_API_KEY || undefined,
    resendApiUrl: process.env.RESEND_API_URL || "https://api.resend.com",
    smtpHost: process.env.SMTP_HOST || undefined,
    smtpPort: Number(process.env.SMTP_PORT ?? 587),
    smtpUser: process.env.SMTP_USER || undefined,
    smtpPass: process.env.SMTP_PASS || undefined,
    smtpSecure: (process.env.SMTP_SECURE ?? "").toLowerCase() === "true",
  },

  // Social identity providers Authenticize can broker. A provider only turns
  // on when BOTH its id and secret are set. Their callback URLs are
  // <BETTER_AUTH_URL>/api/auth/callback/{github,google,microsoft}.
  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    // Azure AD / Entra tenant. "common" (default) accepts both work/school and
    // personal Microsoft accounts; set a specific tenant GUID to restrict to
    // your organization only.
    tenantId: process.env.MICROSOFT_TENANT_ID || undefined,
  },

  // Invite-only by default: a social login can LINK to an already-invited
  // account but cannot create a brand-new one. Set SOCIAL_ALLOW_SIGNUP=true to
  // let any Google/Microsoft/GitHub identity self-provision a plain (non-admin)
  // app account on first sign-in.
  socialAllowSignup:
    (process.env.SOCIAL_ALLOW_SIGNUP ?? "").toLowerCase() === "true",
};
