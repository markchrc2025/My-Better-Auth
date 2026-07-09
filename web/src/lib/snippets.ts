import type { CreatedApp, OAuthApp } from "./api.ts";

export interface ConnectionInfo {
  issuer: string;
  discovery: string;
  authorize: string;
  token: string;
  userinfo: string;
  jwks: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  isPublic: boolean;
}

export function connectionInfo(
  origin: string,
  app: Pick<OAuthApp, "clientId" | "type" | "redirectUris"> & { skipConsent?: boolean },
  secret?: string,
): ConnectionInfo {
  const base = `${origin}/api/auth`;
  return {
    issuer: origin,
    discovery: `${origin}/.well-known/openid-configuration`,
    authorize: `${base}/oauth2/authorize`,
    token: `${base}/oauth2/token`,
    userinfo: `${base}/oauth2/userinfo`,
    jwks: `${base}/jwks`,
    clientId: app.clientId,
    clientSecret: secret,
    redirectUri: app.redirectUris[0] ?? "",
    isPublic: app.type !== "web",
  };
}

export function fromCreated(origin: string, created: CreatedApp): ConnectionInfo {
  return connectionInfo(
    origin,
    {
      clientId: created.client_id,
      type: created.type ?? "web",
      redirectUris: created.redirect_uris,
    },
    created.client_secret,
  );
}

export function envSnippet(c: ConnectionInfo): string {
  const lines = [
    `OIDC_ISSUER=${c.issuer}`,
    `OIDC_CLIENT_ID=${c.clientId}`,
  ];
  if (!c.isPublic) {
    lines.push(`OIDC_CLIENT_SECRET=${c.clientSecret ?? "<your client secret>"}`);
  }
  lines.push(`OIDC_REDIRECT_URI=${c.redirectUri}`);
  return lines.join("\n");
}

export function nextAuthSnippet(c: ConnectionInfo): string {
  return `// auth.ts — Auth.js / NextAuth v5 custom OIDC provider
import NextAuth from "next-auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: "my-better-auth",
      name: "My Better Auth",
      type: "oidc",
      issuer: "${c.issuer}",
      clientId: process.env.OIDC_CLIENT_ID!,
      ${c.isPublic ? "// public client — no secret" : "clientSecret: process.env.OIDC_CLIENT_SECRET!,"}
      authorization: { params: { scope: "openid profile email offline_access" } },
    },
  ],
});
// Callback URL to register: ${c.redirectUri}`;
}

export function nodeSnippet(c: ConnectionInfo): string {
  return `// Node.js with openid-client v5
import { Issuer, generators } from "openid-client";

const issuer = await Issuer.discover("${c.issuer}");
const client = new issuer.Client({
  client_id: "${c.clientId}",
  ${c.isPublic ? 'token_endpoint_auth_method: "none",' : 'client_secret: process.env.OIDC_CLIENT_SECRET,'}
  redirect_uris: ["${c.redirectUri}"],
  response_types: ["code"],
});

// 1) Redirect the user to:
const codeVerifier = generators.codeVerifier();
const url = client.authorizationUrl({
  scope: "openid profile email offline_access",
  code_challenge: generators.codeChallenge(codeVerifier),
  code_challenge_method: "S256",
});

// 2) In your callback handler, exchange the code:
// const params = client.callbackParams(req);
// const tokens = await client.callback("${c.redirectUri}", params, { code_verifier: codeVerifier });`;
}

export function spaSnippet(c: ConnectionInfo): string {
  return `// Browser SPA — Authorization Code + PKCE (no client secret)
const issuer = "${c.issuer}";
const clientId = "${c.clientId}";
const redirectUri = "${c.redirectUri}";

// 1) Start login
const verifier = crypto.randomUUID() + crypto.randomUUID();
const data = new TextEncoder().encode(verifier);
const digest = await crypto.subtle.digest("SHA-256", data);
const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
  .replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
sessionStorage.setItem("pkce_verifier", verifier);
location.href = \`\${issuer}/api/auth/oauth2/authorize?response_type=code\` +
  \`&client_id=\${clientId}&redirect_uri=\${encodeURIComponent(redirectUri)}\` +
  \`&scope=\${encodeURIComponent("openid profile email")}\` +
  \`&code_challenge=\${challenge}&code_challenge_method=S256\`;

// 2) On the redirect back, exchange ?code= for tokens
const code = new URLSearchParams(location.search).get("code");
const res = await fetch(\`\${issuer}/api/auth/oauth2/token\`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code: code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: sessionStorage.getItem("pkce_verifier"),
  }),
});
const tokens = await res.json(); // { access_token, id_token, ... }`;
}
