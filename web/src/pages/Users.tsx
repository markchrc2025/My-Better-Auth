import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "../components/Layout.tsx";
import { Modal, Spinner, useToast } from "../components/ui.tsx";
import { users, type PlatformUser, type UserSession } from "../lib/api.ts";

export function UsersPage() {
  const toast = useToast();
  const [list, setList] = useState<PlatformUser[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [managing, setManaging] = useState<PlatformUser | null>(null);

  const load = (q = search) =>
    users
      .list({ search: q || undefined })
      .then((r) => {
        setList(r.users);
        setTotal(r.total);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHeader
        title="Users"
        description={`${total} account${total === 1 ? "" : "s"}. New users are created here (invite-only).`}
        action={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            Create user
          </button>
        }
      />

      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <input
          className="input"
          placeholder="Search by email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn-secondary shrink-0" type="submit">
          Search
        </button>
      </form>

      {error && (
        <div className="card mb-6 border-red-900/60 p-4 text-sm text-red-300">{error}</div>
      )}

      {!list ? (
        <Spinner />
      ) : list.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">No users found.</div>
      ) : (
        <div className="card divide-y divide-border">
          {list.map((u) => (
            <button
              key={u.id}
              onClick={() => setManaging(u)}
              className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left transition-colors hover:bg-elevated"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-slate-100">{u.email}</span>
                  {u.role === "admin" && <span className="badge-green">admin</span>}
                  {u.banned && <span className="badge-red">banned</span>}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted">{u.name}</div>
              </div>
              <span className="text-muted">›</span>
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
      {managing && (
        <ManageUserModal
          user={managing}
          onClose={() => setManaging(null)}
          onChanged={() => load()}
          notify={toast.push}
        />
      )}
    </>
  );
}

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await users.create({ name: name.trim(), email: email.trim(), password, role });
      toast.push("success", "User created");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create user");
      setBusy(false);
    }
  };

  return (
    <Modal title="Create user" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="label" htmlFor="u-name">
            Name
          </label>
          <input id="u-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="u-email">
            Email
          </label>
          <input id="u-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="u-pass">
            Temporary password
          </label>
          <input id="u-pass" type="text" className="input font-mono" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          <p className="hint">At least 8 characters. Share it securely; the user can change it later.</p>
        </div>
        <div>
          <label className="label" htmlFor="u-role">
            Role
          </label>
          <select id="u-role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="user">User</option>
            <option value="admin">Admin (platform access)</option>
          </select>
        </div>
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
            {busy ? "Creating…" : "Create user"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ManageUserModal({
  user,
  onClose,
  onChanged,
  notify,
}: {
  user: PlatformUser;
  onClose: () => void;
  onChanged: () => void;
  notify: (kind: "success" | "error", msg: string) => void;
}) {
  const [sessions, setSessions] = useState<UserSession[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const loadSessions = () =>
    users
      .sessions(user.id)
      .then((r) => setSessions(r.sessions))
      .catch(() => setSessions([]));

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      notify("success", ok);
      onChanged();
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const isAdmin = user.role === "admin";

  return (
    <Modal title={user.email} wide onClose={onClose}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() =>
              run(
                () => users.setRole(user.id, isAdmin ? "user" : "admin"),
                isAdmin ? "Admin role removed" : "Promoted to admin",
              )
            }
          >
            {isAdmin ? "Revoke admin" : "Make admin"}
          </button>
          {user.banned ? (
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => run(() => users.unban(user.id), "User unbanned")}
            >
              Unban
            </button>
          ) : (
            <button
              className="btn-danger"
              disabled={busy}
              onClick={() =>
                run(() => users.ban(user.id, "Banned by admin"), "User banned")
              }
            >
              Ban
            </button>
          )}
          <button
            className="btn-danger"
            disabled={busy}
            onClick={() => {
              if (confirm(`Delete ${user.email}? This cannot be undone.`)) {
                run(() => users.remove(user.id), "User deleted").then(onClose);
              }
            }}
          >
            Delete user
          </button>
        </div>

        <div>
          <div className="label">Set a new password</div>
          <div className="flex gap-2">
            <input
              className="input font-mono"
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 chars)"
            />
            <button
              className="btn-secondary shrink-0"
              disabled={busy || newPassword.length < 8}
              onClick={() =>
                run(() => users.setPassword(user.id, newPassword), "Password updated").then(
                  () => setNewPassword(""),
                )
              }
            >
              Set
            </button>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="label mb-0">
              Active sessions {sessions ? `(${sessions.length})` : ""}
            </div>
          </div>
          {!sessions ? (
            <Spinner />
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted">No active sessions.</p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="truncate text-slate-200">
                      {s.userAgent || "Unknown device"}
                    </div>
                    <div className="text-muted">
                      {s.ipAddress || "—"} · expires{" "}
                      {new Date(s.expiresAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    className="btn-ghost shrink-0 px-2 py-1"
                    disabled={busy}
                    onClick={() =>
                      run(() => users.revokeSession(s.token), "Session revoked").then(
                        loadSessions,
                      )
                    }
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
