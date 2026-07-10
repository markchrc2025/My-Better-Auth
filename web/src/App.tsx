import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout.tsx";
import { Spinner, ToastProvider } from "./components/ui.tsx";
import { useSession } from "./lib/auth-client.ts";
import { AppDetailPage } from "./pages/AppDetail.tsx";
import { AppsPage } from "./pages/Apps.tsx";
import { ConsentPage } from "./pages/Consent.tsx";
import { ForgotPasswordPage } from "./pages/ForgotPassword.tsx";
import { LoginPage } from "./pages/Login.tsx";
import { OverviewPage } from "./pages/Overview.tsx";
import { ResetPasswordPage } from "./pages/ResetPassword.tsx";
import { SettingsPage } from "./pages/Settings.tsx";
import { UsersPage } from "./pages/Users.tsx";

function isAdmin(user: { role?: string | null } | undefined): boolean {
  return user?.role === "admin";
}

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center p-8 text-center">
      {children}
    </div>
  );
}

/** Requires an authenticated admin session; otherwise routes to /login. */
function RequireAdmin({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const location = useLocation();

  if (isPending) {
    return (
      <CenteredMessage>
        <Spinner label="Checking session…" />
      </CenteredMessage>
    );
  }
  if (!session) {
    // Preserve the query string so OAuth error params surface on the login page.
    return (
      <Navigate
        to={{ pathname: "/login", search: window.location.search }}
        replace
        state={{ from: location }}
      />
    );
  }
  if (!isAdmin(session.user)) {
    return (
      <CenteredMessage>
        <div className="card max-w-md p-6">
          <h1 className="text-lg font-semibold text-slate-100">Not authorized</h1>
          <p className="mt-2 text-sm text-muted">
            You are signed in as <span className="code">{session.user.email}</span>, but
            this account does not have platform admin access.
          </p>
        </div>
      </CenteredMessage>
    );
  }
  return <Layout>{children}</Layout>;
}

export function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/consent" element={<ConsentPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/" element={<RequireAdmin><OverviewPage /></RequireAdmin>} />
        <Route path="/apps" element={<RequireAdmin><AppsPage /></RequireAdmin>} />
        <Route
          path="/apps/:clientId"
          element={<RequireAdmin><AppDetailPage /></RequireAdmin>}
        />
        <Route path="/users" element={<RequireAdmin><UsersPage /></RequireAdmin>} />
        <Route path="/settings" element={<RequireAdmin><SettingsPage /></RequireAdmin>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}
