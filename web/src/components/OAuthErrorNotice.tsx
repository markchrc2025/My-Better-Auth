import { useState } from "react";

/**
 * When an OAuth authorize request is rejected before a client redirect is
 * possible (unknown client, invalid redirect_uri, ...), the provider lands
 * the browser on this app with ?error=...&error_description=... — surface it
 * loudly instead of silently showing the page.
 */
const HINTS: Record<string, string> = {
  invalid_redirect:
    "The app's redirect URI isn't registered. Open the application in this dashboard and add the exact callback URL it presented (see the app's /api/auth/providers output).",
  invalid_client:
    "Unknown or disabled client_id — check the application's credentials and enabled state.",
  client_disabled: "This application is disabled. Enable it on its detail page.",
};

export function OAuthErrorNotice() {
  const [dismissed, setDismissed] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  if (!error || dismissed) return null;
  const description = params.get("error_description");

  return (
    <div className="mb-6 rounded-lg border border-red-900/60 bg-red-950/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-red-200">
            An app's sign-in request was rejected: <span className="code">{error}</span>
          </div>
          {description && (
            <p className="mt-1 text-sm text-red-300/90">{description}</p>
          )}
          {HINTS[error] && <p className="mt-2 text-xs text-red-300/80">{HINTS[error]}</p>}
        </div>
        <button
          className="btn-ghost -mr-1 px-2 py-1 text-red-300"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
