import { useState, type FormEvent } from "react";
import { authClient } from "../lib/auth-client.ts";

/**
 * Doubles as the dashboard login and the OIDC provider's login page.
 *
 * When an app sends a user to /oauth2/authorize and there is no session, the
 * server redirects here with the (signed) OAuth query in the URL. After a
 * successful sign-in we simply re-navigate to the authorize endpoint with that
 * same query; the server now sees a session and continues the flow (issuing a
 * code or redirecting to /consent).
 */
export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = window.location.search;
  const params = new URLSearchParams(search);
  const isOidcFlow = params.has("client_id") && params.has("redirect_uri");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      setError(error.message ?? "Sign in failed");
      setBusy(false);
      return;
    }
    if (isOidcFlow) {
      // Resume the OAuth flow — full-page navigation so the browser follows
      // the server's redirect back to the requesting app.
      window.location.href = `/api/auth/oauth2/authorize${search}`;
      return;
    }
    // Hard navigation so the dashboard loads with the session already
    // established (avoids a race with the client session store).
    window.location.href = "/";
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-3xl">🔐</div>
          <h1 className="mt-2 text-xl font-semibold text-slate-100">My Better Auth</h1>
          <p className="mt-1 text-sm text-muted">
            {isOidcFlow
              ? `Sign in to continue to ${params.get("client_id")}`
              : "Sign in to the admin dashboard"}
          </p>
        </div>
        <form className="card space-y-4 p-6" onSubmit={onSubmit}>
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <div className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          <button className="btn-primary w-full" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-muted">
          This is a private, invite-only platform.
        </p>
      </div>
    </div>
  );
}
