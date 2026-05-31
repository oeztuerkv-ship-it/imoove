import { escapeHtmlMail, sendOnrodaMail } from "./onrodaSmtpMail.js";

export function panelPasswordResetPageBaseUrl(): string {
  const raw =
    process.env.PANEL_AUTH_PASSWORD_RESET_PAGE_URL?.trim() || "https://panel.onroda.de/password-reset";
  return raw.replace(/\/$/, "");
}

export function buildPanelPasswordResetLink(rawToken: string): string {
  const base = panelPasswordResetPageBaseUrl();
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}token=${encodeURIComponent(rawToken)}`;
}

export async function sendPanelPasswordResetMail(input: {
  to: string;
  resetLink: string;
  username: string;
  expiresAt: Date;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const to = input.to.trim();
  if (!to || !to.includes("@")) {
    return { ok: false, reason: "invalid_to" };
  }

  const subject = "Onroda Partner-Portal: Passwort zurücksetzen";
  const until = input.expiresAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
  const ttlMinutes = Math.max(1, Math.round((input.expiresAt.getTime() - Date.now()) / 60_000));
  const resetLinkEsc = escapeHtmlMail(input.resetLink);

  const text = [
    "Guten Tag,",
    "",
    "Sie haben ein neues Passwort für das Onroda-Partner-Portal angefordert.",
    "",
    input.resetLink,
    "",
    `Der Link ist etwa ${ttlMinutes} Minuten gültig (bis ${until}, Europe/Berlin).`,
    `Benutzername: ${input.username}`,
    "",
    "Wenn Sie keine Anfrage gestellt haben, ignorieren Sie diese E-Mail.",
    "",
    "Mit freundlichen Grüßen",
    "Onroda",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;">
  <div style="max-width:500px;margin:auto;background:white;padding:30px;border-radius:10px;">
    <p style="text-align:center;font-size:22px;font-weight:800;"><span style="color:#e30613;">On</span><span style="color:#111;">roda</span></p>
    <h2 style="text-align:center;font-size:18px;color:#111;">Passwort zurücksetzen</h2>
    <p style="line-height:1.5;color:#333;">Sie haben ein neues Passwort für das <strong>Partner-Portal</strong> angefordert.</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="${resetLinkEsc}" style="display:inline-block;background:#0d9488;color:#fff;padding:14px 22px;text-decoration:none;border-radius:6px;font-weight:bold;">
        Neues Passwort festlegen
      </a>
    </p>
    <p style="font-size:12px;color:#888;">Link gültig ${ttlMinutes} Min. (bis ${escapeHtmlMail(until)}). Benutzername: <code>${escapeHtmlMail(input.username)}</code></p>
  </div>
</body></html>`;

  return sendOnrodaMail({
    to,
    subject,
    text,
    html,
    logEvent: "panel.auth.password_reset_mail.sent",
  });
}
