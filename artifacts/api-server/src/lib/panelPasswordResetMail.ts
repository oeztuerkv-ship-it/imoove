import {
  buildOnrodaPasswordResetMailHtml,
  ONRODA_PASSWORD_RESET_SECURITY_NOTE_DE,
} from "./onrodaPasswordResetMailLayout.js";
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
  const userEsc = escapeHtmlMail(input.username);
  const untilEsc = escapeHtmlMail(until);
  const securityNote = ONRODA_PASSWORD_RESET_SECURITY_NOTE_DE;

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

  const html = buildOnrodaPasswordResetMailHtml({
    preheader: "Passwort zurücksetzen für das Onroda-Partner-Portal — Link nur begrenzt gültig.",
    introHtml:
      "Sie haben ein neues Passwort für das <strong>Onroda-Partner-Portal</strong> angefordert.",
    action: {
      kind: "link",
      href: input.resetLink,
      label: "Neues Passwort festlegen",
    },
    metaHtml: `Dieser Link ist ${ttlMinutes} Minuten gültig (bis ${untilEsc}, Europe/Berlin). Benutzername: <code>${userEsc}</code>`,
    securityNote,
  });

  return sendOnrodaMail({
    to,
    subject,
    text,
    html,
    logEvent: "panel.auth.password_reset_mail.sent",
  });
}
