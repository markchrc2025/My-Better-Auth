import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Same-origin in production (served by the auth server); Vite proxies /api to
// the auth server in dev. Cookies are same-origin, so no extra config needed.
export const authClient = createAuthClient({
  plugins: [adminClient()],
});

export const { useSession, signIn, signOut } = authClient;
