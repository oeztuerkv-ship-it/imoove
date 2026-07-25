import nodemailer from "nodemailer";
import { onrodaBrandLogoMailImgHtml } from "./onrodaBrandLogoAsset.js";
import { logger } from "./logger";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Willkommens-Mail für neu angelegte Fleet-Fahrer (Fahrer-App-Login = E-Mail + Einmalpasswort).
 * SMTP wie Partner-Freigabe: `PARTNER_REGISTRATION_SMTP_URL` / `PARTNER_REGISTRATION_MAIL_FROM`.
 */
export async function sendFleetDriverWelcomeEmail(input: {
  to: string;
  companyName: string;
  driverDisplayName?: string;
  emailLogin: string;
  initialPassword: string;
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
      "fleet driver welcome mail skipped (set PARTNER_REGISTRATION_SMTP_URL and PARTNER_REGISTRATION_MAIL_FROM)",
    );
    return { ok: false, reason: "smtp_not_configured" };
  }

  const company = input.companyName.trim() || "Ihr Unternehmen";
  const login = input.emailLogin.trim().toLowerCase();
  const pw = input.initialPassword;
  const greetingName = (input.driverDisplayName ?? "").trim();
  const hello = greetingName ? `Guten Tag ${greetingName},` : "Guten Tag,";

  const subject = `Onroda: Zugang zur Fahrer-App — ${company}`;
  const text = [
    hello,
    "",
    `für „${company}“ wurde ein Fahrer-Zugang in der Onroda-App angelegt.`,
    "",
    "Login in der Onroda-App (Bereich Fahrer):",
    `E-Mail: ${login}`,
    `Einmalpasswort: ${pw}`,
    "",
    "Bitte ändern Sie das Passwort beim ersten Login.",
    "Die App finden Sie im App Store bzw. bei Google Play unter „ONRODA“.",
  ].join("\n");

  const logoHtml = onrodaBrandLogoMailImgHtml();
  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8" /></head>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111827;">
  ${logoHtml}
  <p>${escapeHtml(hello)}</p>
  <p>für <strong>${escapeHtml(company)}</strong> wurde ein <strong>Fahrer-Zugang</strong> in der Onroda-App angelegt.</p>
  <p><strong>E-Mail (Login):</strong> <code>${escapeHtml(login)}</code><br/>
     <strong>Einmalpasswort:</strong> <code>${escapeHtml(pw)}</code></p>
  <p>Bitte ändern Sie das Passwort beim ersten Login (Pflicht).</p>
  <p>App: App Store / Google Play — <strong>ONRODA</strong> (Fahrer-Bereich).</p>
</body></html>`;

  try {
    const transport = nodemailer.createTransport(smtpUrl);
    await transport.sendMail({ from, to, subject, text, html });
    logger.info({ to, event: "admin.fleet_driver.welcome_mail.sent" }, "fleet driver welcome mail sent");
    return { ok: true };
  } catch (err) {
    logger.warn({ err, to }, "fleet driver welcome mail failed");
    return { ok: false, reason: "send_failed" };
  }
}
