import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { OAuthErrorNotice } from "../components/OAuthErrorNotice.tsx";
import { Spinner } from "../components/ui.tsx";
import { authClient } from "../lib/auth-client.ts";

type ProviderId = "google" | "microsoft" | "apple" | "github";

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
  apple: {
    label: "Continue with Apple",
    icon: (
      <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
        <path d="M11.18 8.46c-.02-1.7 1.39-2.52 1.45-2.56-.79-1.16-2.02-1.32-2.46-1.34-1.05-.11-2.04.61-2.57.61-.53 0-1.35-.6-2.22-.58-1.14.02-2.19.66-2.78 1.68-1.18 2.06-.3 5.1.85 6.77.56.82 1.23 1.73 2.11 1.7.85-.03 1.17-.55 2.19-.55 1.02 0 1.31.55 2.21.53.91-.02 1.49-.83 2.05-1.65.65-.95.91-1.87.93-1.92-.02-.01-1.78-.69-1.79-2.72ZM9.47 3.4c.47-.57.79-1.36.7-2.15-.68.03-1.5.45-1.98 1.02-.43.5-.81 1.31-.71 2.08.76.06 1.53-.39 1.99-.95Z" />
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
 * Read (and immediately clear) the one-click provider hint the auth server
 * dropped as a short-lived cookie when a connecting app requested
 * ?provider_hint=… on its authorize call. We use a cookie rather than a query
 * param because Better Auth strips unknown params from the signed login
 * redirect (see src/lib/auth.ts). Reading once, and clearing on read, means a
 * stale hint can never silently re-trigger a redirect on a later visit.
 */
function takeProviderHint(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)az_provider_hint=([^;]+)/);
  if (!match) return null;
  document.cookie = "az_provider_hint=; path=/; max-age=0; samesite=lax";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

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

  // Which sign-in methods this login shows. Null until loaded; narrowed to the
  // requesting app's selection when an app drives the flow (per-app methods).
  const [methods, setMethods] = useState<{
    email: boolean;
    passkey: boolean;
    social: ProviderId[];
  } | null>(null);

  // Second-factor challenge shown after a correct password when 2FA is on.
  const [stage, setStage] = useState<"credentials" | "twofactor">("credentials");
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);

  const search = window.location.search;
  const params = new URLSearchParams(search);
  const clientId = params.get("client_id");
  const isOidcFlow = params.has("client_id") && params.has("redirect_uri");

  // A connecting app can request one-click brokering to a specific provider by
  // passing ?provider_hint=google (etc.) on its authorize request. The auth
  // server relays it to us as a cookie (read + cleared once, on mount). When
  // that provider is enabled for the app we skip this page and bounce straight
  // to the provider — used by tenant SSO in downstream apps so their "Continue
  // with Google/Microsoft" buttons never surface Authenticize's own UI.
  const [providerHint] = useState<string | null>(() => takeProviderHint());
  const [autoRedirect, setAutoRedirect] = useState<ProviderId | null>(null);
  const autoTriggered = useRef(false);

  // Where a successful/failed social round-trip lands. In an OIDC flow both
  // point back into the authorize request so the provider hand-off is
  // invisible to the connecting app.
  const callbackURL = isOidcFlow ? `/api/auth/oauth2/authorize${search}` : "/";
  const errorCallbackURL = isOidcFlow ? `/login${search}` : "/login";

  // Full-page navigation so the browser follows the server's redirect (OIDC)
  // or loads the dashboard with the session already established.
  const proceed = () => {
    window.location.href = isOidcFlow
      ? `/api/auth/oauth2/authorize${search}`
      : "/";
  };

  useEffect(() => {
    let active = true;
    const q = clientId ? `?client_id=${encodeURIComponent(clientId)}` : "";
    fetch(`/api/public-config${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (!active) return;
        const m = cfg?.methods;
        if (m && typeof m === "object") {
          setMethods({
            email: m.email !== false,
            passkey: Boolean(m.passkey),
            social: Array.isArray(m.social) ? (m.social as ProviderId[]) : [],
          });
        } else {
          // Config unavailable — fall back to email/password so login still works.
          setMethods({ email: true, passkey: false, social: [] });
        }
      })
      .catch(() => {
        if (active) setMethods({ email: true, passkey: false, social: [] });
      });
    return () => {
      active = false;
    };
  }, [clientId]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await authClient.signIn.email({ email, password });
    if (error) {
      setError(error.message ?? "Sign in failed");
      setBusy(false);
      return;
    }
    // 2FA-enabled accounts don't get a session yet — verify the second factor.
    if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
      setStage("twofactor");
      setBusy(false);
      return;
    }
    proceed();
  };

  const onVerify2fa = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code })
      : await authClient.twoFactor.verifyTotp({ code });
    if (error) {
      setError(error.message ?? "That code didn't match.");
      setBusy(false);
      return;
    }
    proceed();
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
      // Fall back to the full sign-in page instead of a dead spinner.
      setAutoRedirect(null);
    }
  };

  // Auto-broker when an app asks for a specific provider via provider_hint and
  // that provider is actually enabled for the app. Fires once, only inside an
  // OIDC flow; otherwise this page renders normally.
  useEffect(() => {
    if (!methods || !isOidcFlow || autoTriggered.current) return;
    const hint = providerHint as ProviderId | null;
    if (hint && methods.social.includes(hint)) {
      autoTriggered.current = true;
      setAutoRedirect(hint);
      void onSocial(hint);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [methods]);

  const onPasskey = async () => {
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.passkey();
    if (error) {
      // A dismissed system prompt isn't a real error worth showing.
      if (!/cancel|abort/i.test(error.message ?? "")) {
        setError(error.message ?? "Passkey sign-in failed.");
      }
      setBusy(false);
      return;
    }
    proceed();
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-3xl">🔐</div>
          <h1 className="mt-2 text-xl font-semibold text-slate-100">Authenticize</h1>
          <p className="mt-1 text-sm text-muted">
            {stage === "twofactor"
              ? "Enter your second factor"
              : isOidcFlow
                ? `Sign in to continue to ${params.get("client_id")}`
                : "Sign in to the admin dashboard"}
          </p>
        </div>
        <OAuthErrorNotice />

        {stage === "twofactor" ? (
          <div className="card p-6">
            <form className="space-y-4" onSubmit={onVerify2fa}>
              <p className="text-sm text-muted">
                {useBackup
                  ? "Enter one of your saved backup codes."
                  : "Enter the 6-digit code from your authenticator app."}
              </p>
              <div>
                <label className="label" htmlFor="otp">
                  {useBackup ? "Backup code" : "Authentication code"}
                </label>
                <input
                  id="otp"
                  inputMode={useBackup ? "text" : "numeric"}
                  autoComplete="one-time-code"
                  className="input tracking-widest"
                  value={code}
                  onChange={(e) =>
                    setCode(
                      useBackup
                        ? e.target.value.trim()
                        : e.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                  placeholder={useBackup ? "xxxxxxxxxx" : "123456"}
                  required
                  autoFocus
                />
              </div>
              {error && (
                <div className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                  {error}
                </div>
              )}
              <button className="btn-primary w-full" type="submit" disabled={busy}>
                {busy ? "Verifying…" : "Verify"}
              </button>
              <button
                type="button"
                className="w-full text-center text-xs text-muted hover:text-slate-200"
                onClick={() => {
                  setUseBackup((v) => !v);
                  setCode("");
                  setError(null);
                }}
              >
                {useBackup ? "Use your authenticator app instead" : "Use a backup code"}
              </button>
            </form>
          </div>
        ) : autoRedirect && !error ? (
          <div className="card p-6">
            <div className="flex flex-col items-center gap-3 py-4">
              <Spinner />
              <p className="text-sm text-muted">
                Continuing with{" "}
                {PROVIDER_META[autoRedirect]?.label.replace(/^Continue with /, "") ??
                  autoRedirect}
                …
              </p>
            </div>
          </div>
        ) : (
          <div className="card space-y-4 p-6">
            {methods === null ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : (
              <>
                {(methods.social.length > 0 || methods.passkey) && (
                  <div className="space-y-2">
                    {methods.social.map((p) => (
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
                    {methods.passkey && (
                      <button
                        type="button"
                        className="btn-secondary w-full"
                        disabled={busy}
                        onClick={onPasskey}
                      >
                        <span aria-hidden="true">🔑</span>
                        Sign in with a passkey
                      </button>
                    )}
                  </div>
                )}
                {error && (
                  <div className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                    {error}
                  </div>
                )}
                {methods.email && (methods.social.length > 0 || methods.passkey) && (
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted">or</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                {methods.email && (
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
                    <button className="btn-primary w-full" type="submit" disabled={busy}>
                      {busy ? "Signing in…" : "Sign in"}
                    </button>
                    <p className="text-center text-xs">
                      <a href="/forgot-password" className="text-muted hover:text-slate-200">
                        Forgot password?
                      </a>
                    </p>
                  </form>
                )}
                {!methods.email && methods.social.length === 0 && !methods.passkey && (
                  <p className="text-center text-sm text-muted">
                    No sign-in methods are enabled for this application.
                  </p>
                )}
              </>
            )}
          </div>
        )}
        <p className="mt-4 text-center text-xs text-muted">
          This is a private, invite-only platform.
        </p>
      </div>
    </div>
  );
}
