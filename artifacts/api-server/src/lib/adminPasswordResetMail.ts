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

  const subject = "Onroda: Passwort für die Admin-Konsole zurücksetzen";
  const until = input.expiresAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
  const text = [
    "Guten Tag,",
    "",
    `für den Zugang „${input.username}“ wurde ein Passwort-Reset angefordert.`,
    "",
    "Bitte öffnen Sie den folgenden Link, um ein neues Passwort zu setzen (einmalig gültig):",
    input.resetLink,
    "",
    `Der Link ist bis etwa ${until} (Europe/Berlin) gültig, sofern nicht bereits verwendet.`,
    "",
    "Wenn Sie keinen Reset angefordert haben, ignorieren Sie diese Nachricht.",
    "",
    "Mit freundlichen Grüßen",
    "Onroda",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8" /></head>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111827;">
  <p>Guten Tag,</p>
  <p>für den Zugang <strong>${escapeHtml(input.username)}</strong> wurde ein <strong>Passwort-Reset</strong> für die Admin-Konsole angefordert.</p>
  <p><a href="${escapeHtml(input.resetLink)}">Neues Passwort setzen</a></p>
  <p style="color:#6b7280;font-size:13px;">Der Link ist bis etwa ${escapeHtml(until)} (Europe/Berlin) gültig, sofern nicht bereits verwendet.</p>
  <p style="color:#6b7280;font-size:13px;">Wenn Sie keinen Reset angefordert haben, ignorieren Sie diese Nachricht.</p>
  <p style="margin-top:24px;color:#6b7280;font-size:12px;">Onroda</p>
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
