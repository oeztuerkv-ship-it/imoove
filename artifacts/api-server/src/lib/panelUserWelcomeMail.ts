import nodemailer from "nodemailer";
import { logger } from "./logger";

function panelBaseUrl(): string {
  return (process.env.PARTNER_REGISTRATION_PANEL_URL ?? "https://panel.onroda.de").replace(/\/$/, "");
}

function marketingLogoSrc(): string {
  const u = (process.env.PARTNER_REGISTRATION_STATUS_PAGE_URL ?? "https://www.onroda.de/partner/anfrage-status").replace(
    /\/$/,
    "",
  );
  try {
    return `${new URL(u).origin}/onroda-mark.png`;
  } catch {
    return "https://www.onroda.de/onroda-mark.png";
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Einladung nach manueller Anlage eines Partner-Panel-Zugangs durch die Plattform.
 * Nutzt dieselbe SMTP-Konfiguration wie Partner-Freigabe (`PARTNER_REGISTRATION_SMTP_URL` / `…_MAIL_FROM`).
 */
export async function sendPanelUserWelcomeEmail(input: {
  to: string;
  companyName: string;
  username: string;
  initialPassword: string;
  accessKindLabel?: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const smtpUrl = (process.env.PARTNER_REGISTRATION_SMTP_URL ?? "").trim();
  const from = (process.env.PARTNER_REGISTRATION_MAIL_FROM ?? "").trim();
  const to = input.to.trim();
  if (!to || !to.includes("@")) {
    return { ok: false, reason: "invalid_to" };
  }
  if (!smtpUrl || !from) {
    logger.info(
      { to },
      "panel user welcome mail skipped (set PARTNER_REGISTRATION_SMTP_URL and PARTNER_REGISTRATION_MAIL_FROM)",
    );
    return { ok: false, reason: "smtp_not_configured" };
  }

  const panel = panelBaseUrl();
  const company = input.companyName.trim() || "Ihr Unternehmen";
  const user = input.username.trim();
  const pw = input.initialPassword;
  const kind = (input.accessKindLabel ?? "").trim();

  const subject = `Onroda: Zugang zum Partner-Portal — ${company}`;
  const text = [
    "Guten Tag,",
    "",
    `für „${company}“ wurde ein Zugang zum Onroda-Partner-Portal angelegt.`,
    kind ? `Art / Hinweis: ${kind}` : "",
    "",
    `Partner-Portal: ${panel}`,
    `Benutzername: ${user}`,
    `Einmalpasswort: ${pw}`,
    "",
    "Bitte ändern Sie das Passwort nach dem ersten Login.",
    "",
    "Mit freundlichen Grüßen",
    "Onroda",
  ]
    .filter(Boolean)
    .join("\n");

  const logoSrc = marketingLogoSrc();
  const kindHtml = kind ? `<p><strong>Art / Hinweis:</strong> ${escapeHtml(kind)}</p>` : "";
  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8" /></head>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111827;">
  <p style="margin:0 0 16px"><img src="${escapeHtml(logoSrc)}" alt="ONRODA" width="120" height="40" style="display:block;max-width:100%;height:auto;border:0" /></p>
  <p>Guten Tag,</p>
  <p>für <strong>${escapeHtml(company)}</strong> wurde ein Zugang zum <strong>Onroda-Partner-Portal</strong> angelegt.</p>
  ${kindHtml}
  <p><a href="${escapeHtml(panel)}">Zum Partner-Portal</a></p>
  <p><strong>Benutzername:</strong> <code>${escapeHtml(user)}</code><br/>
     <strong>Einmalpasswort:</strong> <code>${escapeHtml(pw)}</code></p>
  <p>Bitte ändern Sie das Passwort nach dem ersten Login.</p>
  <p style="margin-top:24px;color:#6b7280;font-size:12px;">Onroda</p>
</body></html>`;

  try {
    const transport = nodemailer.createTransport(smtpUrl);
    await transport.sendMail({ from, to, subject, text, html });
    logger.info({ to, event: "admin.panel_user.welcome_mail.sent" }, "panel user welcome mail sent");
    return { ok: true };
  } catch (err) {
    logger.warn({ err, to }, "panel user welcome mail failed");
    return { ok: false, reason: "send_failed" };
  }
}
