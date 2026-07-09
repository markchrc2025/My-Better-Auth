import { useEffect, useState } from "react";
import { PageHeader } from "../components/Layout.tsx";
import { CopyField, Spinner } from "../components/ui.tsx";
import { api, type PlatformConfig } from "../lib/api.ts";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm text-slate-200">{children}</span>
    </div>
  );
}

export function SettingsPage() {
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.config().then(setConfig).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Platform configuration (managed through environment variables)."
      />
      {error && (
        <div className="card mb-6 border-red-900/60 p-4 text-sm text-red-300">{error}</div>
      )}
      {!config ? (
        <Spinner />
      ) : (
        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="mb-2 text-sm font-semibold text-slate-200">Configuration</h2>
            <Row label="Issuer">
              <span className="code">{config.issuer}</span>
            </Row>
            <Row label="Auth base path">
              <span className="code">{config.authBasePath}</span>
            </Row>
            <Row label="Sign-up mode">
              {config.inviteOnly ? "Invite-only" : "Open"}
            </Row>
            <Row label="Cookie domain">
              {config.cookieDomain ? (
                <span className="code">{config.cookieDomain}</span>
              ) : (
                <span className="text-muted">not set</span>
              )}
            </Row>
          </div>

          <div className="card p-5">
            <h2 className="mb-2 text-sm font-semibold text-slate-200">
              Social sign-in providers
            </h2>
            <Row label="GitHub">
              <span className={config.socialProviders.github ? "badge-green" : "badge-gray"}>
                {config.socialProviders.github ? "Enabled" : "Not configured"}
              </span>
            </Row>
            <Row label="Google">
              <span className={config.socialProviders.google ? "badge-green" : "badge-gray"}>
                {config.socialProviders.google ? "Enabled" : "Not configured"}
              </span>
            </Row>
            <p className="mt-3 text-xs text-muted">
              Providers activate automatically when their client ID/secret environment
              variables are set on the server. Redirect URL:{" "}
              <span className="code">{config.issuer}/api/auth/callback/&lt;provider&gt;</span>
            </p>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-200">Discovery</h2>
            <CopyField label="OpenID configuration" value={config.discovery} />
          </div>
        </div>
      )}
    </>
  );
}
