import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../components/Layout.tsx";
import { ConnectionDetails } from "../components/ConnectionDetails.tsx";
import { Modal, Spinner, useToast } from "../components/ui.tsx";
import { api, type CreatedApp, type OAuthApp } from "../lib/api.ts";
import { fromCreated, type ConnectionInfo } from "../lib/snippets.ts";

const TYPE_LABELS: Record<string, string> = {
  web: "Web (confidential)",
  "user-agent-based": "SPA (public)",
  native: "Native (public)",
};

export function AppsPage() {
  const [apps, setApps] = useState<OAuthApp[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [created, setCreated] = useState<ConnectionInfo | null>(null);
  const navigate = useNavigate();

  const load = () =>
    api
      .listApps()
      .then((r) => setApps(r.apps))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const onCreated = (app: CreatedApp) => {
    setShowCreate(false);
    setCreated(fromCreated(window.location.origin, app));
    load();
  };

  return (
    <>
      <PageHeader
        title="Applications"
        description="OAuth 2.1 / OIDC clients that can authenticate users through this platform."
        action={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            Connect an app
          </button>
        }
      />

      {error && (
        <div className="card mb-6 border-red-900/60 p-4 text-sm text-red-300">{error}</div>
      )}

      {!apps ? (
        <Spinner />
      ) : apps.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-2xl">❖</div>
          <h2 className="mt-2 font-medium text-slate-100">No applications yet</h2>
          <p className="mt-1 text-sm text-muted">
            Connect your first app to generate OAuth credentials.
          </p>
          <button className="btn-primary mt-4" onClick={() => setShowCreate(true)}>
            Connect an app
          </button>
        </div>
      ) : (
        <div className="card divide-y divide-border">
          {apps.map((app) => (
            <button
              key={app.clientId}
              onClick={() => navigate(`/apps/${encodeURIComponent(app.clientId)}`)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-elevated"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-slate-100">
                    {app.name ?? app.clientId}
                  </span>
                  {app.disabled && <span className="badge-red">Disabled</span>}
                </div>
                <div className="mt-0.5 truncate font-mono text-xs text-muted">
                  {app.clientId}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="badge-gray">{TYPE_LABELS[app.type] ?? app.type}</span>
                <span className="text-muted">›</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateAppModal onClose={() => setShowCreate(false)} onCreated={onCreated} />
      )}

      {created && (
        <Modal title="Application connected" wide onClose={() => setCreated(null)}>
          <div className="mb-4 rounded-md border border-brand/40 bg-brand/10 px-3 py-2 text-sm text-brand">
            Copy the client secret now — it is not shown again. You can rotate it later
            if needed.
          </div>
          <ConnectionDetails info={created} />
          <div className="mt-5 flex justify-end">
            <button className="btn-primary" onClick={() => setCreated(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function CreateAppModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (app: CreatedApp) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [redirects, setRedirects] = useState("");
  const [type, setType] = useState<"web" | "user-agent-based" | "native">("web");
  const [skipConsent, setSkipConsent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const redirect_uris = redirects
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (redirect_uris.length === 0) {
      setError("At least one redirect URI is required.");
      return;
    }
    for (const uri of redirect_uris) {
      try {
        new URL(uri);
      } catch {
        setError(`Invalid redirect URI: ${uri}`);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const app = await api.createApp({
        name: name.trim(),
        redirect_uris,
        type,
        skip_consent: skipConsent,
      });
      toast.push("success", "Application created");
      onCreated(app);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create app");
      setBusy(false);
    }
  };

  return (
    <Modal title="Connect an app" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="label" htmlFor="app-name">
            Application name
          </label>
          <input
            id="app-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sentire Payroll"
            required
            autoFocus
          />
        </div>
        <div>
          <label className="label" htmlFor="app-redirects">
            Redirect URIs
          </label>
          <textarea
            id="app-redirects"
            className="input min-h-[72px] font-mono text-xs"
            value={redirects}
            onChange={(e) => setRedirects(e.target.value)}
            placeholder={"https://app.example.com/api/auth/callback/authenticize"}
            required
          />
          <p className="hint">One per line. Must be the full URL including path.</p>
        </div>
        <div>
          <label className="label" htmlFor="app-type">
            Application type
          </label>
          <select
            id="app-type"
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="web">Web app — has a backend (gets a client secret)</option>
            <option value="user-agent-based">SPA — browser only (PKCE, no secret)</option>
            <option value="native">Native / mobile (PKCE, no secret)</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand"
            checked={skipConsent}
            onChange={(e) => setSkipConsent(e.target.checked)}
          />
          Skip consent screen (recommended for your own first-party apps)
        </label>
        {error && (
          <div className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Creating…" : "Create application"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
