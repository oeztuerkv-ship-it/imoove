import nodemailer from "nodemailer";
import { logger } from "./logger.js";

export function escapeHtmlMail(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Produktiver SMTP-Stack (Admin-Reset, Partner-Freigabe, Fleet-Reset, Rechnungs-Erinnerung).
 * Reihenfolge: ADMIN_AUTH_MAIL_* → PARTNER_REGISTRATION_* → MAIL_FROM / SMTP_URL.
 */
export function resolveOnrodaSmtpUrl(): string {
  return (
    process.env.ADMIN_AUTH_MAIL_SMTP_URL ??
    process.env.PARTNER_REGISTRATION_SMTP_URL ??
    process.env.SMTP_URL ??
    ""
  ).trim();
}

export function resolveOnrodaMailFrom(): string {
  return (
    process.env.ADMIN_AUTH_MAIL_FROM ??
    process.env.PARTNER_REGISTRATION_MAIL_FROM ??
    process.env.MAIL_FROM ??
    ""
  ).trim();
}

export function isOnrodaSmtpConfigured(): boolean {
  return Boolean(resolveOnrodaSmtpUrl() && resolveOnrodaMailFrom());
}

export async function sendOnrodaMail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  logEvent?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const smtpUrl = resolveOnrodaSmtpUrl();
  const from = resolveOnrodaMailFrom();
  const to = input.to.trim();
  if (!to || !to.includes("@")) {
    return { ok: false, reason: "invalid_to" };
  }
  if (!smtpUrl || !from) {
    return { ok: false, reason: "smtp_not_configured" };
  }

  try {
    const transport = nodemailer.createTransport(smtpUrl);
    await transport.sendMail({
      from,
      to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType ?? "application/pdf",
      })),
    });
    if (input.logEvent) {
      logger.info({ event: input.logEvent, to: to.replace(/(.{2}).*(@.*)/, "$1…$2") }, "onroda mail sent");
    }
    return { ok: true };
  } catch (err) {
    logger.warn({ err, event: input.logEvent ?? "onroda.mail" }, "onroda mail send failed");
    return { ok: false, reason: "send_failed" };
  }
}
