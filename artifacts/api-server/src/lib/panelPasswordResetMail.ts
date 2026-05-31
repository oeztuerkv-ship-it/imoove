import { onrodaBrandLogoMailImgHtml } from "./onrodaBrandLogoAsset.js";
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
  const logoHtml = onrodaBrandLogoMailImgHtml({ centered: true });
  const userEsc = escapeHtmlMail(input.username);

  const securityNote =
    "Wenn Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese E-Mail. Ihr Passwort bleibt unverändert.";

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
    securityNote,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;">
  <div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;">
    Passwort zurücksetzen für das Onroda-Partner-Portal — Link nur begrenzt gültig.
  </div>
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;padding:20px;">
    <div style="max-width:500px;margin:auto;background:white;padding:30px;border-radius:10px;">
      ${logoHtml}
      <h2 style="text-align:center;margin:0 0 16px;font-size:20px;color:#111;">Passwort zurücksetzen</h2>
      <p style="margin:0 0 12px;line-height:1.5;color:#333;">Sie haben ein neues Passwort für das <strong>Onroda-Partner-Portal</strong> angefordert.</p>
      <div style="text-align:center;margin:30px 0;">
        <a href="${resetLinkEsc}"
           style="display:inline-block;background:#e30613;color:#ffffff;padding:15px 25px;text-decoration:none;border-radius:6px;font-weight:bold;">
          Neues Passwort festlegen
        </a>
      </div>
      <p style="font-size:12px;color:#888;margin:0;line-height:1.5;">
        Dieser Link ist ${ttlMinutes} Minuten gültig (bis ${escapeHtmlMail(until)}, Europe/Berlin). Benutzername: <code>${userEsc}</code>
      </p>
      <p style="font-size:12px;color:#888;margin:16px 0 0;line-height:1.5;border-top:1px solid #e8edf4;padding-top:14px;">
        ${escapeHtmlMail(securityNote)}
      </p>
    </div>
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
