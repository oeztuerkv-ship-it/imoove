import { createHash, randomInt, timingSafeEqual } from "node:crypto";
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
 * Reset-Code-Mail über denselben SMTP-Stack wie Admin/Partner
 * (`ADMIN_AUTH_MAIL_*` → `PARTNER_REGISTRATION_*` → `MAIL_FROM`/`SMTP_URL`).
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
  const codeEsc = escapeHtmlMail(input.code);

  const subject = "Passwort zurücksetzen (Fahrer-App)";
  const text = [
    "Du hast eine Anfrage zum Zurücksetzen deines ONRODA-Fahrer-Passworts gestellt.",
    "",
    `Dein Code: ${input.code}`,
    "",
    `Gib den Code in der Fahrer-App ein. Er ist etwa ${ttlMinutes} Minuten gültig (bis ${until}, Europe/Berlin).`,
    "",
    "Wenn du keinen Reset angefordert hast, ignoriere diese Nachricht.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;">
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;padding:20px;">
    <div style="max-width:500px;margin:auto;background:white;padding:30px;border-radius:10px;">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:28px;font-weight:800;letter-spacing:0.02em;line-height:1.2;">
          <span style="color:#e30613;">On</span><span style="color:#111111;">roda</span>
        </div>
      </div>
      <p style="font-size:16px;color:#111;line-height:1.5;">Du hast eine Anfrage zum Zurücksetzen deines <strong>Fahrer-App</strong>-Passworts gestellt.</p>
      <p style="font-size:14px;color:#444;line-height:1.5;margin:20px 0 8px;">Dein Code:</p>
      <p style="font-size:32px;font-weight:800;letter-spacing:0.2em;text-align:center;color:#111;margin:8px 0 20px;">${codeEsc}</p>
      <p style="font-size:13px;color:#666;line-height:1.5;">Gültig ca. ${ttlMinutes} Minuten (bis ${escapeHtmlMail(until)}, Europe/Berlin). Gib den Code in der Fahrer-App ein und wähle ein neues Passwort.</p>
      <p style="font-size:12px;color:#999;margin-top:24px;">Wenn du keinen Reset angefordert hast, ignoriere diese Nachricht.</p>
    </div>
  </div>
</body></html>`;

  return sendOnrodaMail({
    to,
    subject,
    text,
    html,
    logEvent: "fleet.auth.password_reset_mail.sent",
  });
}
