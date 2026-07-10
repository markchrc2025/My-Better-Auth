import { env } from "../env.js";

const APP_NAME = "Authenticize";

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0b0d0e;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d0e;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#131719;border:1px solid #252b2e;border-radius:10px;">
          <tr><td style="padding:28px 32px 8px;text-align:center;">
            <div style="font-size:26px;">&#128272;</div>
            <div style="color:#f1f5f9;font-size:16px;font-weight:600;padding-top:6px;">${APP_NAME}</div>
          </td></tr>
          <tr><td style="padding:8px 32px 28px;color:#cbd5e1;font-size:14px;line-height:1.6;">
            <h1 style="color:#f1f5f9;font-size:18px;margin:12px 0;">${title}</h1>
            ${bodyHtml}
            <p style="color:#8b969c;font-size:12px;margin-top:28px;">
              Sent by ${APP_NAME} · <a href="${env.baseURL}" style="color:#3ecf8e;text-decoration:none;">${env.baseURL}</a><br/>
              If you didn't expect this email, you can safely ignore it.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function button(url: string, label: string): string {
  return `<p style="text-align:center;margin:24px 0;">
    <a href="${url}" style="display:inline-block;background:#3ecf8e;color:#04120b;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px;text-decoration:none;">${label}</a>
  </p>
  <p style="color:#8b969c;font-size:12px;word-break:break-all;">Or copy this link: ${url}</p>`;
}

export function resetPasswordEmail(opts: { url: string; invite: boolean }) {
  if (opts.invite) {
    return {
      subject: `You've been invited to ${APP_NAME}`,
      html: layout(
        "Welcome — set your password",
        `<p>An account has been created for you. Click below to choose your password and activate it. The link expires in 1 hour.</p>
         ${button(opts.url, "Set my password")}`,
      ),
      text:
        `An account has been created for you on ${APP_NAME}.\n\n` +
        `Set your password (link expires in 1 hour):\n${opts.url}\n`,
    };
  }
  return {
    subject: `Reset your ${APP_NAME} password`,
    html: layout(
      "Reset your password",
      `<p>We received a request to reset your password. Click below to choose a new one. The link expires in 1 hour.</p>
       ${button(opts.url, "Reset password")}
       <p>If you didn't request this, no action is needed — your password is unchanged.</p>`,
    ),
    text:
      `Reset your ${APP_NAME} password (link expires in 1 hour):\n${opts.url}\n\n` +
      `If you didn't request this, no action is needed.\n`,
  };
}

export function verificationEmail(opts: { url: string }) {
  return {
    subject: `Verify your email for ${APP_NAME}`,
    html: layout(
      "Verify your email address",
      `<p>Confirm that this email address belongs to you.</p>
       ${button(opts.url, "Verify email")}`,
    ),
    text: `Verify your email for ${APP_NAME}:\n${opts.url}\n`,
  };
}
