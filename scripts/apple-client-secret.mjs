#!/usr/bin/env node
/**
 * Generate the "client secret" JWT that Sign in with Apple requires.
 *
 * Apple doesn't hand you a static client secret like Google/Microsoft — you
 * sign a short-lived ES256 JWT from your private key (.p8). It expires in at
 * most 6 months, so re-run this and update APPLE_CLIENT_SECRET before then.
 *
 * Usage (values from the Apple Developer portal):
 *   APPLE_TEAM_ID=ABCDE12345 \
 *   APPLE_KEY_ID=KEY1234567 \
 *   APPLE_CLIENT_ID=com.yourcompany.auth        # your Services ID (the web client_id) \
 *   APPLE_PRIVATE_KEY_PATH=./AuthKey_KEY1234567.p8 \
 *   npm run apple:secret
 *
 * Instead of APPLE_PRIVATE_KEY_PATH you can pass the key inline in
 * APPLE_PRIVATE_KEY (literal "\n" between the PEM lines is accepted).
 *
 * Prints the JWT to stdout (so you can pipe it); notes go to stderr.
 */
import { readFileSync } from "node:fs";
import { createPrivateKey, sign as signData } from "node:crypto";

const b64url = (input) => Buffer.from(input).toString("base64url");

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[apple:secret] Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

const teamId = required("APPLE_TEAM_ID");
const keyId = required("APPLE_KEY_ID");
const clientId = required("APPLE_CLIENT_ID"); // Services ID = the web OAuth client_id

const pem = process.env.APPLE_PRIVATE_KEY
  ? process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n")
  : process.env.APPLE_PRIVATE_KEY_PATH
    ? readFileSync(process.env.APPLE_PRIVATE_KEY_PATH, "utf8")
    : null;
if (!pem) {
  console.error(
    "[apple:secret] Provide the .p8 key via APPLE_PRIVATE_KEY_PATH or APPLE_PRIVATE_KEY.",
  );
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const months = Math.min(Number(process.env.APPLE_SECRET_MONTHS ?? 6), 6); // Apple caps at 6
const exp = now + months * 30 * 24 * 60 * 60;

const header = { alg: "ES256", kid: keyId };
const payload = {
  iss: teamId,
  iat: now,
  exp,
  aud: "https://appleid.apple.com",
  sub: clientId,
};

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
// ES256 for JOSE needs the raw R||S signature (ieee-p1363), not Node's default DER.
const signature = signData("sha256", Buffer.from(signingInput), {
  key: createPrivateKey(pem),
  dsaEncoding: "ieee-p1363",
});

process.stdout.write(`${signingInput}.${b64url(signature)}\n`);
console.error(
  `\n[apple:secret] Set this as APPLE_CLIENT_SECRET. Expires ${new Date(
    exp * 1000,
  ).toISOString()} — regenerate before then.`,
);
