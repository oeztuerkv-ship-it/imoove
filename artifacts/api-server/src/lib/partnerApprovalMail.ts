import nodemailer from "nodemailer";
import { logger } from "./logger";

function panelBaseUrl(): string {
  return (process.env.PARTNER_REGISTRATION_PANEL_URL ?? "https://panel.onroda.de").replace(/\/$/, "");
}

function statusPageUrl(): string {
  return (process.env.PARTNER_REGISTRATION_STATUS_PAGE_URL ?? "https://www.onroda.de/partner/anfrage-status").replace(
    /\/$/,
    "",
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildBodies(input: {
  companyName: string;
  panelUrl: string;
  ownerUsername?: string;
  ownerInitialPassword?: string;
}): { subject: string; text: string; html: string } {
  const company = input.companyName.trim() || "Ihr Unternehmen";
  const subject = `Onroda: Partneranfrage freigegeben — ${company}`;
  const panel = input.panelUrl;
  const status = statusPageUrl();

  let credBlock = "";
  if (input.ownerUsername && input.ownerInitialPassword) {
    credBlock = [
      "",
      "Ihr Erstzugang zum Partner-Portal:",
      `  Benutzername: ${input.ownerUsername}`,
      `  Einmalpasswort: ${input.ownerInitialPassword}`,
      "",
      "Bitte ändern Sie das Passwort nach dem ersten Login.",
    ].join("\n");
  }

  const text = [
    `Guten Tag,`,
    ``,
    `Ihre Partneranfrage für „${company}“ wurde freigegeben.`,
    ``,
    `Partner-Portal: ${panel}`,
    `Status Ihrer Anfrage: ${status}`,
    credBlock,
    ``,
    `Mit freundlichen Grüßen`,
    `Onroda`,
  ].join("\n");

  const pwHtml =
    input.ownerUsername && input.ownerInitialPassword
      ? `<p><strong>Erstzugang Partner-Portal</strong></p>
         <ul>
           <li>Benutzername: <code>${escapeHtml(input.ownerUsername)}</code></li>
           <li>Einmalpasswort: <code>${escapeHtml(input.ownerInitialPassword)}</code></li>
         </ul>
         <p>Bitte ändern Sie das Passwort nach dem ersten Login.</p>`
      : `<p>Die Zugangsdaten zum Partner-Portal erhalten Sie separat von uns, falls noch nicht angelegt.</p>`;

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8" /></head>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111827;">
  <p>Guten Tag,</p>
  <p>Ihre Partneranfrage für <strong>${escapeHtml(company)}</strong> wurde <strong>freigegeben</strong>.</p>
  <p><a href="${escapeHtml(panel)}">Zum Partner-Portal</a></p>
  <p><a href="${escapeHtml(status)}">Anfrage-Status ansehen</a></p>
  ${pwHtml}
  <p style="margin-top:24px;color:#6b7280;font-size:12px;">Onroda</p>
</body></html>`;

  return { subject, text, html };
}

/**
 * Optional: setzt `PARTNER_REGISTRATION_SMTP_URL` (z. B. smtps://user:pass@smtp.example.com:465)
 * und `PARTNER_REGISTRATION_MAIL_FROM`. Ohne Konfiguration wird nichts gesendet (nur Log).
 */
export async function sendPartnerRegistrationApprovedEmail(input: {
  to: string;
  companyName: string;
  ownerUsername?: string;
  ownerInitialPassword?: string;
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
      "partner approval mail skipped (set PARTNER_REGISTRATION_SMTP_URL and PARTNER_REGISTRATION_MAIL_FROM)",
    );
    return { ok: false, reason: "smtp_not_configured" };
  }

  const panelUrl = panelBaseUrl();
  const { subject, text, html } = buildBodies({
    companyName: input.companyName,
    panelUrl,
    ownerUsername: input.ownerUsername,
    ownerInitialPassword: input.ownerInitialPassword,
  });

  try {
    const transport = nodemailer.createTransport(smtpUrl);
    await transport.sendMail({ from, to, subject, text, html });
    logger.info({ to, event: "partner.registration.approval_mail.sent" }, "partner approval mail sent");
    return { ok: true };
  } catch (err) {
    logger.warn({ err, to }, "partner approval mail failed");
    return { ok: false, reason: "send_failed" };
  }
}
