import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { authClient, useSession } from "../lib/auth-client.ts";

const nav = [
  { to: "/", label: "Overview", end: true, icon: "◫" },
  { to: "/apps", label: "Applications", icon: "❖" },
  { to: "/users", label: "Users", icon: "◍" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

export function Layout({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const navigate = useNavigate();

  const logout = async () => {
    await authClient.signOut();
    navigate("/login");
  };

  return (
    <div className="flex min-h-full">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-panel p-4 sm:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="text-xl">🔐</span>
          <span className="font-semibold text-slate-100">My Better Auth</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-elevated font-medium text-brand"
                    : "text-muted hover:bg-elevated hover:text-slate-200"
                }`
              }
            >
              <span className="w-4 text-center opacity-80">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 border-t border-border pt-4">
          <div className="truncate px-3 text-xs text-muted" title={session?.user.email}>
            {session?.user.email}
          </div>
          <button className="btn-ghost mt-2 w-full justify-start px-3" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-panel/60 px-6 py-3 sm:hidden">
          <span className="font-semibold">🔐 My Better Auth</span>
          <button className="btn-ghost px-2" onClick={logout}>
            Sign out
          </button>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
