import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { OAuthErrorNotice } from "../components/OAuthErrorNotice.tsx";
import { authClient } from "../lib/auth-client.ts";

type ProviderId = "google" | "microsoft" | "github";

const PROVIDER_META: Record<ProviderId, { label: string; icon: ReactNode }> = {
  google: {
    label: "Continue with Google",
    icon: (
      <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
        />
        <path
          fill="#FBBC05"
          d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
        />
      </svg>
    ),
  },
  microsoft: {
    label: "Continue with Microsoft",
    icon: (
      <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
        <path fill="#F25022" d="M0 0h8.5v8.5H0z" />
        <path fill="#7FBA00" d="M9.5 0H18v8.5H9.5z" />
        <path fill="#00A4EF" d="M0 9.5h8.5V18H0z" />
        <path fill="#FFB900" d="M9.5 9.5H18V18H9.5z" />
      </svg>
    ),
  },
  github: {
    label: "Continue with GitHub",
    icon: (
      <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
      </svg>
    ),
  },
};

/**
 * Doubles as the dashboard login and the OIDC provider's login page.
 *
 * When an app sends a user to /oauth2/authorize and there is no session, the
 * server redirects here with the (signed) OAuth query in the URL. After a
 * successful sign-in — email/password or a social provider — we re-navigate to
 * the authorize endpoint with that same query; the server now sees a session
 * and continues the flow (issuing a code or redirecting to /consent).
 *
 * Social sign-in bounces through Google/Microsoft first, so we hand the
 * provider a callbackURL that resumes the authorize request when it returns.
 */
export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<ProviderId[]>([]);

  const search = window.location.search;
  const params = new URLSearchParams(search);
  const isOidcFlow = params.has("client_id") && params.has("redirect_uri");

  // Where a successful/failed social round-trip lands. In an OIDC flow both
  // point back into the authorize request so the provider hand-off is
  // invisible to the connecting app.
  const callbackURL = isOidcFlow ? `/api/auth/oauth2/authorize${search}` : "/";
  const errorCallbackURL = isOidcFlow ? `/login${search}` : "/login";

  useEffect(() => {
    let active = true;
    fetch("/api/public-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (active && Array.isArray(cfg?.socialProviders)) {
          setProviders(cfg.socialProviders as ProviderId[]);
        }
      })
      .catch(() => {
        /* login still works with email/password if this fails */
      });
    return () => {
      active = false;
    };
  }, []);

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

  const onSocial = async (provider: ProviderId) => {
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL,
      errorCallbackURL,
    });
    // On success the client redirects the whole page to the provider, so we
    // only reach here if the request itself failed to start.
    if (error) {
      setError(error.message ?? `Could not start ${provider} sign-in`);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-3xl">🔐</div>
          <h1 className="mt-2 text-xl font-semibold text-slate-100">Authenticize</h1>
          <p className="mt-1 text-sm text-muted">
            {isOidcFlow
              ? `Sign in to continue to ${params.get("client_id")}`
              : "Sign in to the admin dashboard"}
          </p>
        </div>
        <OAuthErrorNotice />
        <div className="card space-y-4 p-6">
          {providers.length > 0 && (
            <>
              <div className="space-y-2">
                {providers.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="btn-secondary w-full"
                    disabled={busy}
                    onClick={() => onSocial(p)}
                  >
                    {PROVIDER_META[p]?.icon}
                    {PROVIDER_META[p]?.label ?? `Continue with ${p}`}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          <form className="space-y-4" onSubmit={onSubmit}>
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
            <p className="text-center text-xs">
              <a href="/forgot-password" className="text-muted hover:text-slate-200">
                Forgot password?
              </a>
            </p>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-muted">
          This is a private, invite-only platform.
        </p>
      </div>
    </div>
  );
}
