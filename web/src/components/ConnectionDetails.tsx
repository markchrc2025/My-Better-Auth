import { useState } from "react";
import type { ConnectionInfo } from "../lib/snippets.ts";
import {
  envSnippet,
  nextAuthSnippet,
  nodeSnippet,
  spaSnippet,
} from "../lib/snippets.ts";
import { CopyField } from "./ui.tsx";

const TABS = [
  { key: "env", label: "Env vars", gen: envSnippet },
  { key: "next", label: "Next.js / Auth.js", gen: nextAuthSnippet },
  { key: "node", label: "Node (openid-client)", gen: nodeSnippet },
  { key: "spa", label: "Browser SPA (PKCE)", gen: spaSnippet },
] as const;

function SnippetBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      /* ignore */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative">
      <button
        className="btn-secondary absolute right-2 top-2 z-10 px-2 py-1 text-xs"
        onClick={copy}
        type="button"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <pre className="max-h-80 overflow-auto rounded-md border border-border bg-bg p-4 pt-10 font-mono text-xs leading-relaxed text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function ConnectionDetails({ info }: { info: ConnectionInfo }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("env");
  const active = TABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <CopyField label="Client ID" value={info.clientId} />
        {info.clientSecret ? (
          <CopyField label="Client secret" value={info.clientSecret} />
        ) : (
          <div>
            <div className="label">Client secret</div>
            <div className="rounded-md border border-border bg-bg px-3 py-2 text-xs text-muted">
              {info.isPublic ? "Public client — no secret (PKCE)" : "Shown only once"}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CopyField label="Issuer" value={info.issuer} />
        <CopyField label="Discovery URL" value={info.discovery} />
        <CopyField label="Authorization endpoint" value={info.authorize} />
        <CopyField label="Token endpoint" value={info.token} />
        <CopyField label="Userinfo endpoint" value={info.userinfo} />
        <CopyField label="JWKS URI" value={info.jwks} />
      </div>

      <div>
        <div className="mb-2 flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t.key
                  ? "bg-elevated text-brand"
                  : "text-muted hover:bg-elevated hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <SnippetBlock code={active.gen(info)} />
      </div>
    </div>
  );
}
