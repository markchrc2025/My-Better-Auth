// Thin client for the platform admin API (/admin/api/*) and a few Better Auth
// OIDC endpoints that have no typed client action.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export interface AppStats {
  users: number;
  activeSessions: number;
  apps: number;
}

export interface PlatformConfig {
  issuer: string;
  discovery: string;
  authBasePath: string;
  inviteOnly: boolean;
  cookieDomain: string | null;
  emailConfigured: boolean;
  emailProvider: string | null;
  socialAllowSignup: boolean;
  socialProviders: {
    google: boolean;
    microsoft: boolean;
    apple: boolean;
    github: boolean;
  };
}

export interface OAuthApp {
  id: string;
  clientId: string;
  name: string | null;
  type: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  scopes: string[];
  grantTypes: string[];
  disabled: boolean;
  skipConsent: boolean;
  /** Distinct identities that have signed in through this app. */
  userCount: number;
  lastUsedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

// Returned once at creation / rotation; client_secret is only present here.
export interface CreatedApp {
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
  client_name?: string;
  type?: string;
  scope?: string;
  token_endpoint_auth_method?: string;
}

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserSession {
  id: string;
  token: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  impersonatedBy: string | null;
}

// Better Auth admin endpoints. Same-origin, so the browser attaches the
// Origin header automatically (required by Better Auth's CSRF check).
const AUTH = "/api/auth/admin";

export const users = {
  list: (q: { limit?: number; offset?: number; search?: string }) => {
    const params = new URLSearchParams();
    params.set("limit", String(q.limit ?? 100));
    if (q.offset) params.set("offset", String(q.offset));
    if (q.search) {
      params.set("searchField", "email");
      params.set("searchOperator", "contains");
      params.set("searchValue", q.search);
    }
    return request<{ users: PlatformUser[]; total: number }>(
      "GET",
      `${AUTH}/list-users?${params.toString()}`,
    );
  },
  create: (body: { email: string; password: string; name: string; role?: string }) =>
    request<{ user: PlatformUser }>("POST", `${AUTH}/create-user`, body),
  setRole: (userId: string, role: string) =>
    request<unknown>("POST", `${AUTH}/set-role`, { userId, role }),
  ban: (userId: string, banReason?: string) =>
    request<unknown>("POST", `${AUTH}/ban-user`, { userId, banReason }),
  unban: (userId: string) =>
    request<unknown>("POST", `${AUTH}/unban-user`, { userId }),
  setPassword: (userId: string, newPassword: string) =>
    request<unknown>("POST", `${AUTH}/set-user-password`, { userId, newPassword }),
  sessions: (userId: string) =>
    request<{ sessions: UserSession[] }>("POST", `${AUTH}/list-user-sessions`, {
      userId,
    }),
  revokeSession: (sessionToken: string) =>
    request<unknown>("POST", `${AUTH}/revoke-user-session`, { sessionToken }),
  remove: (userId: string) =>
    request<unknown>("POST", `${AUTH}/remove-user`, { userId }),
  // Emails a password setup/reset link. invite=true switches the email
  // template and the reset page copy to the "welcome" variant.
  sendPasswordLink: (email: string, invite: boolean) =>
    request<unknown>("POST", "/api/auth/request-password-reset", {
      email,
      redirectTo: invite ? "/reset-password?invite=1" : "/reset-password",
    }),
};

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: string | null;
  banned: boolean | null;
  signInCount: number;
  lastSignInAt: string;
}

export const api = {
  stats: () => request<AppStats>("GET", "/admin/api/stats"),
  appUsers: (clientId: string) =>
    request<{ users: AppUser[] }>(
      "GET",
      `/admin/api/apps/${encodeURIComponent(clientId)}/users`,
    ),
  authMethods: () =>
    request<{ methods: Record<string, string[]> }>(
      "GET",
      "/admin/api/users/auth-methods",
    ),
  config: () => request<PlatformConfig>("GET", "/admin/api/config"),
  listApps: () => request<{ apps: OAuthApp[] }>("GET", "/admin/api/apps"),
  createApp: (body: {
    name: string;
    redirect_uris: string[];
    type?: "web" | "native" | "user-agent-based";
    skip_consent?: boolean;
    scope?: string;
    client_uri?: string;
    post_logout_redirect_uris?: string[];
  }) => request<CreatedApp>("POST", "/admin/api/apps", body),
  updateApp: (clientId: string, update: Record<string, unknown>) =>
    request<unknown>("PATCH", `/admin/api/apps/${encodeURIComponent(clientId)}`, update),
  setAppDisabled: (clientId: string, disabled: boolean) =>
    request<unknown>(
      "POST",
      `/admin/api/apps/${encodeURIComponent(clientId)}/disabled`,
      { disabled },
    ),
  rotateSecret: (clientId: string) =>
    request<CreatedApp>(
      "POST",
      `/admin/api/apps/${encodeURIComponent(clientId)}/rotate-secret`,
    ),
  deleteApp: (clientId: string) =>
    request<unknown>(
      "DELETE",
      `/admin/api/apps/${encodeURIComponent(clientId)}`,
    ),
};
