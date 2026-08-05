import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import {
  buildOnrodaPasswordResetMailHtml,
  ONRODA_PASSWORD_RESET_SECURITY_NOTE_DE,
} from "./onrodaPasswordResetMailLayout.js";
import { escapeHtmlMail, sendOnrodaMail } from "./onrodaSmtpMail.js";

const CODE_PEPPER_PREFIX = "fleet-driver-password-reset-v1";

function resetSecret(): string {
  const fleet = (process.env.FLEET_DRIVER_JWT_SECRET ?? "").trim();
  if (fleet) return fleet;
  const panel = (process.env.PANEL_JWT_SECRET ?? "").trim();
  if (panel) return panel;
  if (process.env.NODE_ENV === "production") return "";
  return (process.env.AUTH_JWT_SECRET ?? "").trim();
}

export function generateFleetPasswordResetCode(): string {
  return String(randomInt(100000, 1_000_000));
}

export function hashFleetPasswordResetCode(emailNormalized: string, sixDigitCode: string): string {
  const secret = resetSecret();
  const digits = sixDigitCode.replace(/\D/g, "").trim();
  return createHash("sha256")
    .update(`${CODE_PEPPER_PREFIX}|${secret}|${emailNormalized}|${digits}`, "utf8")
    .digest("hex");
}

export function fleetPasswordResetCodesEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function fleetPasswordResetTtlMs(): number {
  const configuredTtlMin = Number(process.env.FLEET_AUTH_RESET_TOKEN_TTL_MINUTES ?? "30");
  const ttlMin = Math.max(5, Number.isFinite(configuredTtlMin) ? configuredTtlMin : 30);
  return ttlMin * 60_000;
}

/**
 * Reset-Code-Mail: gleiches Layout wie Partner-Panel (`onrodaPasswordResetMailLayout`),
 * SMTP wie Admin/Partner (`ADMIN_AUTH_*` → `PARTNER_REGISTRATION_*` → `MAIL_FROM`/`SMTP_URL`).
 */
export async function sendFleetDriverPasswordResetMail(input: {
  to: string;
  code: string;
  expiresAt: Date;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const to = input.to.trim();
  if (!to || !to.includes("@")) {
    return { ok: false, reason: "invalid_to" };
  }

  const until = input.expiresAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
  const ttlMinutes = Math.max(1, Math.round((input.expiresAt.getTime() - Date.now()) / 60_000));
  const untilEsc = escapeHtmlMail(until);
  const securityNote = ONRODA_PASSWORD_RESET_SECURITY_NOTE_DE;

  const subject = "Onroda Fahrer-App: Passwort zurücksetzen";
  const text = [
    "Guten Tag,",
    "",
    "Sie haben ein neues Passwort für die Onroda-Fahrer-App angefordert.",
    "",
    `Ihr Code: ${input.code}`,
    "",
    `Geben Sie den Code in der Fahrer-App ein. Er ist etwa ${ttlMinutes} Minuten gültig (bis ${until}, Europe/Berlin).`,
    "",
    securityNote,
  ].join("\n");

  const html = buildOnrodaPasswordResetMailHtml({
    preheader: "Passwort zurücksetzen für die Onroda-Fahrer-App — Code nur begrenzt gültig.",
    introHtml:
      "Sie haben ein neues Passwort für die <strong>Onroda-Fahrer-App</strong> angefordert. Geben Sie den folgenden Code in der App ein.",
    action: {
      kind: "code",
      code: input.code,
      caption: "Ihr Code",
    },
    metaHtml: `Dieser Code ist ${ttlMinutes} Minuten gültig (bis ${untilEsc}, Europe/Berlin).`,
    securityNote,
  });

  return sendOnrodaMail({
    to,
    subject,
    text,
    html,
    logEvent: "fleet.auth.password_reset_mail.sent",
  });
}
