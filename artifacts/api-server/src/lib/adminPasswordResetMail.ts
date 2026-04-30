import nodemailer from "nodemailer";
import { logger } from "./logger";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveSmtpUrl(): string {
  return (process.env.ADMIN_AUTH_MAIL_SMTP_URL ?? process.env.PARTNER_REGISTRATION_SMTP_URL ?? "").trim();
}

function resolveMailFrom(): string {
  return (process.env.ADMIN_AUTH_MAIL_FROM ?? process.env.PARTNER_REGISTRATION_MAIL_FROM ?? "").trim();
}

/** Öffentliche Admin-Passwort-Reset-Seite (ohne Query); Default produktiv admin.onroda.de + Vite-Base `/partners/`. */
export function adminPasswordResetPageBaseUrl(): string {
  const raw =
    process.env.ADMIN_AUTH_PASSWORD_RESET_PAGE_URL?.trim() ||
    "https://admin.onroda.de/partners/password-reset";
  return raw.replace(/\/$/, "");
}

export function buildAdminPasswordResetLink(rawToken: string): string {
  const base = adminPasswordResetPageBaseUrl();
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}token=${encodeURIComponent(rawToken)}`;
}

/**
 * Versand über denselben SMTP-Stack wie Partner-Freigabe, falls nicht separat konfiguriert:
 * `ADMIN_AUTH_MAIL_SMTP_URL` / `ADMIN_AUTH_MAIL_FROM`, sonst Fallback `PARTNER_REGISTRATION_*`.
 * Ohne SMTP/Absender: kein Versand (nur Log).
 */
export async function sendAdminPasswordResetMail(input: {
  to: string;
  resetLink: string;
  username: string;
  expiresAt: Date;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const smtpUrl = resolveSmtpUrl();
  const from = resolveMailFrom();
  const to = input.to.trim();
  if (!to || !to.includes("@")) {
    return { ok: false, reason: "invalid_to" };
  }
  if (!smtpUrl || !from) {
    logger.info(
      { to: to.replace(/(.{2}).*(@.*)/, "$1…$2") },
      "admin password reset mail skipped (set ADMIN_AUTH_MAIL_SMTP_URL + ADMIN_AUTH_MAIL_FROM, or PARTNER_REGISTRATION_*)",
    );
    return { ok: false, reason: "smtp_not_configured" };
  }

  const subject = "Onroda: Passwort zurücksetzen";
  const until = input.expiresAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
  const ttlMinutes = Math.max(1, Math.round((input.expiresAt.getTime() - Date.now()) / 60_000));
  const linkEsc = escapeHtml(input.resetLink);

  const logoUrl =
    (process.env.ADMIN_AUTH_PASSWORD_RESET_MAIL_LOGO_URL || "").trim() ||
    "https://onroda.de/static/logo-mail.png";
  const logoSrc = `${logoUrl}${logoUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
  const logoSrcEsc = escapeHtml(logoSrc);

  const text = [
    "Du hast eine Anfrage zum Zurücksetzen deines Passworts für die Admin-Konsole gestellt.",
    "",
    `Marken-Logo (falls HTML blockiert): ${logoSrc}`,
    "",
    input.resetLink,
    "",
    `Dieser Link ist etwa ${ttlMinutes} Minuten gültig (bis ${until}, Europe/Berlin), sofern nicht bereits verwendet.`,
    `Zugang: ${input.username}`,
    "",
    "Wenn du keinen Reset angefordert hast, ignoriere diese Nachricht.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;">
  <div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;">
    Du hast eine Anfrage zum Zurücksetzen deines Passworts. Der Link ist nur begrenzt gültig.
  </div>
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;padding:20px;">
    <div style="max-width:500px;margin:auto;background:white;padding:30px;border-radius:10px;">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:28px;font-weight:800;letter-spacing:0.02em;line-height:1.2;">
          <span style="color:#e30613;">On</span><span style="color:#111111;">roda</span>
        </div>
        <img src="${logoSrcEsc}"
             alt="Onroda"
             width="220"
             height="59"
             border="0"
             role="presentation"
             style="display:block;height:59px;width:auto;max-width:220px;margin:8px auto 0;border:0;outline:none;text-decoration:none;line-height:0;font-size:0;-ms-interpolation-mode:bicubic;" />
      </div>
      <h2 style="text-align:center;margin:24px 0 16px;font-size:20px;color:#111;">Passwort zurücksetzen</h2>
      <p style="margin:0 0 12px;line-height:1.5;color:#333;">Du hast eine Anfrage zum Zurücksetzen deines Passworts gestellt.</p>
      <div style="text-align:center;margin:30px 0;">
        <a href="${linkEsc}"
           style="display:inline-block;background:#e30613;color:#ffffff;padding:15px 25px;text-decoration:none;border-radius:6px;font-weight:bold;">
          Passwort zurücksetzen
        </a>
      </div>
      <p style="font-size:12px;color:#888;margin:0;line-height:1.5;">
        Dieser Link ist ${ttlMinutes} Minuten gültig (bis ${escapeHtml(until)}, Europe/Berlin).
      </p>
      <p style="font-size:12px;color:#888;margin:12px 0 0;line-height:1.5;">
        Wenn du keinen Reset angefordert hast, ignoriere diese Nachricht.
      </p>
    </div>
  </div>
</body></html>`;

  try {
    const transport = nodemailer.createTransport(smtpUrl);
    await transport.sendMail({ from, to, subject, text, html });
    logger.info({ event: "admin.auth.password_reset_mail.sent" }, "admin password reset mail sent");
    return { ok: true };
  } catch (err) {
    logger.warn({ err }, "admin password reset mail failed");
    return { ok: false, reason: "send_failed" };
  }
}
