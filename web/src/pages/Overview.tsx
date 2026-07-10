import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/Layout.tsx";
import { OAuthErrorNotice } from "../components/OAuthErrorNotice.tsx";
import { CopyField, Spinner } from "../components/ui.tsx";
import { api, type AppStats, type PlatformConfig } from "../lib/api.ts";

function Stat({ label, value, to }: { label: string; value: number; to: string }) {
  return (
    <Link to={to} className="card block p-5 transition-colors hover:border-brand/50">
      <div className="text-3xl font-semibold text-slate-100">{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </Link>
  );
}

export function OverviewPage() {
  const [stats, setStats] = useState<AppStats | null>(null);
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [dbOk, setDbOk] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.stats(), api.config()])
      .then(([s, c]) => {
        setStats(s);
        setConfig(c);
      })
      .catch((e) => setError(e.message));
    fetch("/health/db")
      .then((r) => setDbOk(r.ok))
      .catch(() => setDbOk(false));
  }, []);

  return (
    <>
      <OAuthErrorNotice />
      <PageHeader
        title="Overview"
        description="Your authentication platform at a glance."
      />
      {error && (
        <div className="card mb-6 border-red-900/60 p-4 text-sm text-red-300">{error}</div>
      )}
      {!stats || !config ? (
        <Spinner />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="Users" value={stats.users} to="/users" />
            <Stat label="Applications" value={stats.apps} to="/apps" />
            <Stat label="Active sessions" value={stats.activeSessions} to="/users" />
          </div>

          <div className="card p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-200">
              Provider endpoints
            </h2>
            <div className="space-y-3">
              <CopyField label="Issuer" value={config.issuer} />
              <CopyField label="OIDC discovery" value={config.discovery} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-muted">Service health:</span>
            <span className={dbOk ? "badge-green" : "badge-red"}>
              {dbOk === null ? "…" : dbOk ? "Database OK" : "Database unreachable"}
            </span>
            <span className="badge-gray">Invite-only</span>
          </div>
        </div>
      )}
    </>
  );
}
