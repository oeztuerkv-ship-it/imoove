import nodemailer from "nodemailer";
import { logger } from "./logger";

export async function sendOnrodaVerificationEmailPlain(
  to: string,
  sixDigitCode: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const smtpUrl = (process.env.SMTP_URL ?? "").trim();
  const from = (process.env.MAIL_FROM ?? "").trim();
  const r = to.trim();
  if (!r.includes("@")) {
    return { ok: false, reason: "invalid_to" };
  }
  if (!smtpUrl || !from) {
    logger.warn(
      { to: r },
      "email verification mail skipped (set SMTP_URL and MAIL_FROM in API environment)",
    );
    return { ok: false, reason: "smtp_not_configured" };
  }

  const text = `Dein ONRODA Bestätigungscode: ${sixDigitCode}`;
  try {
    const transport = nodemailer.createTransport(smtpUrl);
    await transport.sendMail({
      from,
      to: r,
      subject: "ONRODA Bestätigungscode",
      text,
      /** Keine zusätzlichen sensiblen Daten im HTML-Zweig — rein textuell. */
    });
    logger.info({ to: r, event: "email_verification.sent" }, "verification email sent");
    return { ok: true };
  } catch (err) {
    logger.warn({ err, to: r }, "email verification send failed");
    return { ok: false, reason: "send_failed" };
  }
}
