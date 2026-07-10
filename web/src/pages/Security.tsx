import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "../components/Layout.tsx";
import { CopyField, Modal, Spinner, useToast } from "../components/ui.tsx";
import { authClient, useSession } from "../lib/auth-client.ts";

interface Passkey {
  id: string;
  name?: string | null;
  createdAt?: string;
  deviceType?: string | null;
}

/** Pull the base32 secret out of an otpauth:// URI for manual (no-camera) entry. */
function secretFromTotpUri(uri: string): string | null {
  try {
    return new URL(uri).searchParams.get("secret");
  } catch {
    return null;
  }
}

export function SecurityPage() {
  const { data: session } = useSession();
  const { push } = useToast();

  const twoFactorEnabled = Boolean(
    (session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled,
  );

  // Force the session store to re-read after a change that alters the user
  // (twoFactorEnabled), so this page reflects the new state immediately.
  const refreshSession = useCallback(async () => {
    await authClient.getSession({ query: { disableCookieCache: true } });
  }, []);

  return (
    <>
      <PageHeader
        title="Security"
        description="Protect your operator account with a second factor and passkeys."
      />
      <div className="space-y-6">
        <TwoFactorCard
          enabled={twoFactorEnabled}
          onChange={refreshSession}
          notify={push}
        />
        <PasskeysCard notify={push} />
      </div>
    </>
  );
}

/* ---------------- Two-factor ---------------- */

function TwoFactorCard({
  enabled,
  onChange,
  notify,
}: {
  enabled: boolean;
  onChange: () => Promise<void>;
  notify: (kind: "success" | "error", msg: string) => void;
}) {
  const [mode, setMode] = useState<null | "enable" | "disable">(null);

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">
            Two-factor authentication
          </h2>
          <p className="mt-1 text-sm text-muted">
            A time-based code from an authenticator app (Google Authenticator,
            Microsoft Authenticator, 1Password…) on every sign-in.
          </p>
        </div>
        <span className={enabled ? "badge-green shrink-0" : "badge-gray shrink-0"}>
          {enabled ? "Enabled" : "Off"}
        </span>
      </div>
      <div className="mt-4">
        {enabled ? (
          <button className="btn-danger" onClick={() => setMode("disable")}>
            Disable 2FA
          </button>
        ) : (
          <button className="btn-primary" onClick={() => setMode("enable")}>
            Enable 2FA
          </button>
        )}
      </div>

      {mode === "enable" && (
        <EnableTwoFactorModal
          onClose={() => setMode(null)}
          onDone={async () => {
            setMode(null);
            await onChange();
            notify("success", "Two-factor authentication is on.");
          }}
        />
      )}
      {mode === "disable" && (
        <DisableTwoFactorModal
          onClose={() => setMode(null)}
          onDone={async () => {
            setMode(null);
            await onChange();
            notify("success", "Two-factor authentication is off.");
          }}
        />
      )}
    </div>
  );
}

function EnableTwoFactorModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [enroll, setEnroll] = useState<{ totpURI: string; backupCodes: string[] } | null>(
    null,
  );
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (error || !data) {
      setError(error?.message ?? "Could not start setup (check your password).");
      return;
    }
    setEnroll({ totpURI: data.totpURI, backupCodes: data.backupCodes });
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (error) {
      setError(error.message ?? "That code didn't match. Try the next one.");
      return;
    }
    await onDone();
  };

  const secret = enroll ? secretFromTotpUri(enroll.totpURI) : null;

  return (
    <Modal title="Enable two-factor authentication" onClose={onClose}>
      {!enroll ? (
        <form className="space-y-4" onSubmit={start}>
          <p className="text-sm text-muted">
            Confirm your password to generate a setup code.
          </p>
          <div>
            <label className="label" htmlFor="tfp">
              Account password
            </label>
            <input
              id="tfp"
              type="password"
              className="input"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <button className="btn-primary w-full" disabled={busy} type="submit">
            {busy ? "Working…" : "Continue"}
          </button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={verify}>
          <div>
            <p className="text-sm text-muted">
              Scan this with your authenticator app, then enter the 6-digit code it
              shows.
            </p>
            <div className="mt-3 flex justify-center rounded-lg bg-white p-3">
              <QRCodeSVG value={enroll.totpURI} size={168} />
            </div>
            {secret && (
              <div className="mt-3">
                <div className="label">Or enter this key manually</div>
                <CopyField label="" value={secret} />
              </div>
            )}
          </div>

          <div className="rounded-md border border-amber-900/50 bg-amber-950/30 p-3">
            <div className="text-xs font-semibold text-amber-200">
              Save your backup codes
            </div>
            <p className="mt-1 text-xs text-amber-200/80">
              Each works once if you lose your authenticator. Store them somewhere
              safe — they won't be shown again.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs text-slate-200">
              {enroll.backupCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="tfc">
              6-digit code
            </label>
            <input
              id="tfc"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="input tracking-widest"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              required
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <button className="btn-primary w-full" disabled={busy} type="submit">
            {busy ? "Verifying…" : "Verify & enable"}
          </button>
        </form>
      )}
    </Modal>
  );
}

function DisableTwoFactorModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (error) {
      setError(error.message ?? "Could not disable (check your password).");
      return;
    }
    await onDone();
  };

  return (
    <Modal title="Disable two-factor authentication" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <p className="text-sm text-muted">
          This removes the second factor from your account. Confirm your password.
        </p>
        <div>
          <label className="label" htmlFor="tfd">
            Account password
          </label>
          <input
            id="tfd"
            type="password"
            className="input"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button className="btn-danger w-full" disabled={busy} type="submit">
          {busy ? "Working…" : "Disable 2FA"}
        </button>
      </form>
    </Modal>
  );
}

/* ---------------- Passkeys ---------------- */

function PasskeysCard({
  notify,
}: {
  notify: (kind: "success" | "error", msg: string) => void;
}) {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    const { data } = await authClient.$fetch<Passkey[] | { passkeys: Passkey[] }>(
      "/passkey/list-user-passkeys",
      { method: "GET" },
    );
    const list = Array.isArray(data) ? data : (data?.passkeys ?? []);
    setPasskeys(list);
  }, []);

  useEffect(() => {
    load().catch(() => setPasskeys([]));
  }, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await authClient.passkey.addPasskey({
      name: name.trim() || undefined,
    });
    setBusy(false);
    setNaming(false);
    setName("");
    if (error) {
      // A cancelled prompt is a normal user action, not an error worth shouting.
      if (!/cancel|abort/i.test(error.message ?? "")) {
        notify("error", error.message ?? "Could not add passkey.");
      }
      return;
    }
    notify("success", "Passkey added.");
    await load();
  };

  const remove = async (id: string) => {
    const { error } = await authClient.$fetch("/passkey/delete-passkey", {
      method: "POST",
      body: { id },
    });
    if (error) {
      notify("error", error.message ?? "Could not remove passkey.");
      return;
    }
    notify("success", "Passkey removed.");
    await load();
  };

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Passkeys</h2>
          <p className="mt-1 text-sm text-muted">
            Sign in with Face ID, Touch ID, Windows Hello, or a security key — no
            password to phish.
          </p>
        </div>
        {!naming && (
          <button
            className="btn-secondary shrink-0"
            onClick={() => setNaming(true)}
          >
            Add a passkey
          </button>
        )}
      </div>

      {naming && (
        <form className="mt-4 flex items-end gap-2" onSubmit={add}>
          <div className="flex-1">
            <label className="label" htmlFor="pkn">
              Name (optional)
            </label>
            <input
              id="pkn"
              className="input"
              placeholder="MacBook Touch ID"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <button className="btn-primary" disabled={busy} type="submit">
            {busy ? "Waiting…" : "Create"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setNaming(false);
              setName("");
            }}
          >
            Cancel
          </button>
        </form>
      )}

      <div className="mt-4">
        {passkeys === null ? (
          <Spinner />
        ) : passkeys.length === 0 ? (
          <p className="text-sm text-muted">No passkeys yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {passkeys.map((pk) => (
              <li key={pk.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm text-slate-200">
                    {pk.name || "Passkey"}
                  </div>
                  {pk.createdAt && (
                    <div className="text-xs text-muted">
                      Added {new Date(pk.createdAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <button
                  className="btn-ghost shrink-0 text-red-300"
                  onClick={() => remove(pk.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
