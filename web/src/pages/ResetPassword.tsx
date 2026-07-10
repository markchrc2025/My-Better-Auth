import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

/**
 * Landing page for password reset / invite links. Better Auth redirects here
 * with ?token=... (valid) or ?error=INVALID_TOKEN. ?invite=1 marks the
 * first-time "set your password" variant.
 */
export function ResetPasswordPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const linkError = params.get("error");
  const isInvite = params.get("invite") === "1";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const title = isInvite ? "Welcome — set your password" : "Choose a new password";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password, token }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message ?? "Could not reset the password.");
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset the password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-3xl">🔐</div>
          <h1 className="mt-2 text-xl font-semibold text-slate-100">Authenticize</h1>
          <p className="mt-1 text-sm text-muted">{title}</p>
        </div>

        {linkError || !token ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-red-300">
              This link is invalid or has expired.
            </p>
            <Link to="/forgot-password" className="btn-secondary mt-5 inline-flex">
              Request a new link
            </Link>
          </div>
        ) : done ? (
          <div className="card p-6 text-center">
            <div className="text-2xl">✅</div>
            <p className="mt-3 text-sm text-slate-200">
              Your password has been {isInvite ? "set" : "updated"}. You can sign in now.
            </p>
            <Link to="/login" className="btn-primary mt-5 inline-flex">
              Sign in
            </Link>
          </div>
        ) : (
          <form className="card space-y-4 p-6" onSubmit={submit}>
            <div>
              <label className="label" htmlFor="rp-pass">
                New password
              </label>
              <input
                id="rp-pass"
                type="password"
                autoComplete="new-password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoFocus
              />
              <p className="hint">At least 8 characters.</p>
            </div>
            <div>
              <label className="label" htmlFor="rp-confirm">
                Confirm password
              </label>
              <input
                id="rp-confirm"
                type="password"
                autoComplete="new-password"
                className="input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
              />
            </div>
            {error && (
              <div className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}
            <button className="btn-primary w-full" type="submit" disabled={busy}>
              {busy ? "Saving…" : isInvite ? "Set password" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
