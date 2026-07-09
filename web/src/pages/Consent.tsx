import { useState } from "react";

/**
 * OIDC consent screen. The server redirects here (for clients that don't skip
 * consent) with the signed OAuth query in the URL. We display the requesting
 * client and scopes, then POST the whole query back to /oauth2/consent to
 * accept or deny; the response carries the redirect_uri to send the user to.
 */
const SCOPE_LABELS: Record<string, string> = {
  openid: "Verify your identity",
  profile: "Access your basic profile (name, picture)",
  email: "Access your email address",
  offline_access: "Stay signed in (refresh access)",
};

export function ConsentPage() {
  const [busy, setBusy] = useState<null | "accept" | "deny">(null);
  const [error, setError] = useState<string | null>(null);

  const search = window.location.search;
  const params = new URLSearchParams(search);
  const clientId = params.get("client_id") ?? "the application";
  const scopes = (params.get("scope") ?? "").split(/\s+/).filter(Boolean);

  const decide = async (accept: boolean) => {
    setBusy(accept ? "accept" : "deny");
    setError(null);
    try {
      const res = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept, oauth_query: search.replace(/^\?/, "") }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message ?? `Consent failed (${res.status})`);
      }
      const redirect = data?.redirect_uri ?? data?.redirectURI;
      if (redirect) {
        window.location.href = redirect;
      } else {
        throw new Error("No redirect returned by the server");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Consent failed");
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="text-3xl">🔐</div>
          <h1 className="mt-2 text-lg font-semibold text-slate-100">
            Authorize access
          </h1>
          <p className="mt-1 text-sm text-muted">
            <span className="code">{clientId}</span> wants to access your account
          </p>
        </div>
        <div className="card p-6">
          <div className="text-sm font-medium text-slate-300">
            This will allow the application to:
          </div>
          <ul className="mt-3 space-y-2">
            {scopes.map((s) => (
              <li key={s} className="flex items-start gap-2 text-sm text-slate-200">
                <span className="mt-0.5 text-brand">✓</span>
                <span>
                  {SCOPE_LABELS[s] ?? s}
                  <span className="ml-1 text-xs text-muted">({s})</span>
                </span>
              </li>
            ))}
            {scopes.length === 0 && (
              <li className="text-sm text-muted">No specific scopes requested.</li>
            )}
          </ul>
          {error && (
            <div className="mt-4 rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          <div className="mt-6 flex gap-3">
            <button
              className="btn-secondary flex-1"
              onClick={() => decide(false)}
              disabled={busy !== null}
            >
              {busy === "deny" ? "…" : "Deny"}
            </button>
            <button
              className="btn-primary flex-1"
              onClick={() => decide(true)}
              disabled={busy !== null}
            >
              {busy === "accept" ? "Authorizing…" : "Allow"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
