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

/** Logo für Freigabe-Mail (gleiche Marketing-Origin wie Statusseite). */
function marketingLogoUrl(): string {
  try {
    const o = new URL(statusPageUrl());
    return `${o.origin}/onroda-logo.png`;
  } catch {
    return "https://www.onroda.de/onroda-logo.png";
  }
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

  const logoSrc = marketingLogoUrl();
  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8" /></head>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111827;">
  <p style="margin:0 0 16px"><img src="${escapeHtml(logoSrc)}" alt="ONRODA" width="120" height="40" style="display:block;max-width:100%;height:auto;border:0" /></p>
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
 *
 * Roadmap (kleiner Auth-Umbau): Einmalpasswort durch zeitlich begrenzten „Passwort setzen“-Link in der Mail ersetzen.
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

/** Admin-Antwort auf eine Homepage-Registrierung (Bewerber-E-Mail) — getrennt vom Support-System. */
export async function sendPartnerRegistrationAdminMessageEmail(input: {
  to: string;
  requestId: string;
  companyName: string;
  message: string;
  adminLabel: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const smtpUrl = (process.env.PARTNER_REGISTRATION_SMTP_URL ?? "").trim();
  const from = (process.env.PARTNER_REGISTRATION_MAIL_FROM ?? "").trim();
  const to = input.to.trim();
  const message = input.message.trim();
  if (!to || !to.includes("@")) {
    return { ok: false, reason: "invalid_to" };
  }
  if (!message) {
    return { ok: false, reason: "empty_message" };
  }
  if (!smtpUrl || !from) {
    logger.info(
      { to, requestId: input.requestId },
      "partner registration admin reply mail skipped (set PARTNER_REGISTRATION_SMTP_URL and PARTNER_REGISTRATION_MAIL_FROM)",
    );
    return { ok: false, reason: "smtp_not_configured" };
  }
  const status = statusPageUrl();
  const ref = escapeHtml(input.requestId);
  const company = input.companyName.trim() || "Ihre Anfrage";
  const subject = `Onroda: Rückmeldung zu Ihrer Partneranfrage — ${company}`;
  const text = [
    "Guten Tag,",
    "",
    "Sie erhalten eine Nachricht von der Onroda-Plattform zu Ihrer Registrierungsanfrage:",
    "",
    message,
    "",
    `Referenz: ${input.requestId}`,
    `Status/Anfrage: ${status}`,
    "",
    "Mit freundlichen Grüßen",
    `— ${input.adminLabel} (Plattform) / Onroda`,
  ].join("\n");
  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8" /></head>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111827;">
  <p>Guten Tag,</p>
  <p>Sie erhalten eine Rückmeldung zu Ihrer <strong>Partner-Registrierung</strong> (Referenz: <code>${ref}</code>).</p>
  <blockquote style="border-left:3px solid #0ea5e9;padding-left:12px;margin:12px 0;white-space:pre-wrap;">${escapeHtml(
    message,
  )}</blockquote>
  <p><a href="${escapeHtml(status)}">Zum Anfrage-Status (Homepage)</a></p>
  <p style="margin-top:16px;font-size:12px;color:#6b7280;">Absender: ${escapeHtml(
    input.adminLabel,
  )} · Onroda-Plattform (kein Support-Ticket-Posteingang)</p>
</body></html>`;
  try {
    const transport = nodemailer.createTransport(smtpUrl);
    await transport.sendMail({ from, to, subject, text, html });
    logger.info(
      { to, requestId: input.requestId, event: "partner.registration.admin_reply_mail.sent" },
      "partner registration admin reply mail sent",
    );
    return { ok: true };
  } catch (err) {
    logger.warn({ err, to, requestId: input.requestId }, "partner registration admin reply mail failed");
    return { ok: false, reason: "send_failed" };
  }
}

export async function sendPartnerRegistrationRejectionEmail(input: {
  to: string;
  companyName: string;
  requestId: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const smtpUrl = (process.env.PARTNER_REGISTRATION_SMTP_URL ?? "").trim();
  const from = (process.env.PARTNER_REGISTRATION_MAIL_FROM ?? "").trim();
  const to = input.to.trim();
  const reason = input.reason.trim();
  if (!to || !to.includes("@")) {
    return { ok: false, reason: "invalid_to" };
  }
  if (!smtpUrl || !from) {
    logger.info(
      { to, requestId: input.requestId },
      "partner registration rejection mail skipped (set PARTNER_REGISTRATION_SMTP_URL and PARTNER_REGISTRATION_MAIL_FROM)",
    );
    return { ok: false, reason: "smtp_not_configured" };
  }
  const status = statusPageUrl();
  const company = input.companyName.trim() || "Ihre Anfrage";
  const subject = `Onroda: Rückmeldung zu Ihrer Partneranfrage — ${company}`;
  const textBody = reason || "Ihre Registrierungsanfrage wurde abgelehnt.";
  const text = [
    "Guten Tag,",
    "",
    "leider müssen wir Ihnen mitteilen, dass Ihre Registrierungsanfrage auf der Onroda-Plattform nicht angenommen wurde.",
    "",
    textBody,
    "",
    `Referenz: ${input.requestId}`,
    `Weitere Informationen: ${status}`,
    "",
    "Mit freundlichen Grüßen",
    "Onroda",
  ].join("\n");
  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8" /></head>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111827;">
  <p>Guten Tag,</p>
  <p>Leider wurde Ihre <strong>Registrierungsanfrage</strong> (Referenz: <code>${escapeHtml(
    input.requestId,
  )}</code>) für <strong>${escapeHtml(company)}</strong> abgelehnt.</p>
  <p style="white-space: pre-wrap; border-left:3px solid #ef4444; padding-left:12px;">${escapeHtml(
    textBody,
  )}</p>
  <p><a href="${escapeHtml(status)}">Hinweis: Statusseite (Homepage)</a></p>
  <p style="margin-top:16px;font-size:12px;color:#6b7280;">Dieser Vorgang betrifft die Homepage-Registrierung, nicht den Mandanten-Support-Posteingang.</p>
</body></html>`;
  try {
    const transport = nodemailer.createTransport(smtpUrl);
    await transport.sendMail({ from, to, subject, text, html });
    logger.info(
      { to, requestId: input.requestId, event: "partner.registration.rejection_mail.sent" },
      "partner registration rejection mail sent",
    );
    return { ok: true };
  } catch (err) {
    logger.warn({ err, to, requestId: input.requestId }, "partner registration rejection mail failed");
    return { ok: false, reason: "send_failed" };
  }
}
