import { onrodaBrandLogoMailImgHtml } from "./onrodaBrandLogoAsset.js";
import { escapeHtmlMail } from "./onrodaSmtpMail.js";

const DEFAULT_HEADLINE = "Passwort zurücksetzen";

export const ONRODA_PASSWORD_RESET_SECURITY_NOTE_DE =
  "Wenn Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese E-Mail. Ihr Passwort bleibt unverändert.";

/**
 * Gemeinsames HTML-Layout für Passwort-Reset-Mails (Partner-Portal, Fahrer-App, …).
 * Logo, Farben, Kartenstruktur und Footer an einer Stelle.
 */
export function buildOnrodaPasswordResetMailHtml(input: {
  preheader: string;
  headline?: string;
  /** Bereits fertiges HTML für den Einleitungstext (darf `<strong>` enthalten). */
  introHtml: string;
  /**
   * Primäre Aktion: CTA-Button (Link) oder großer Code-Block (Fahrer-App).
   * Werte für href/code/label werden hier escaped.
   */
  action:
    | { kind: "link"; href: string; label: string }
    | { kind: "code"; code: string; caption?: string };
  /** Meta-Zeile unter der Aktion — HTML, Caller escaped Klartext (darf `<code>` enthalten). */
  metaHtml: string;
  securityNote?: string;
}): string {
  const logoHtml = onrodaBrandLogoMailImgHtml({ centered: true });
  const headline = escapeHtmlMail(input.headline?.trim() || DEFAULT_HEADLINE);
  const preheader = escapeHtmlMail(input.preheader);
  const securityNote = escapeHtmlMail(
    (input.securityNote ?? ONRODA_PASSWORD_RESET_SECURITY_NOTE_DE).trim(),
  );

  let actionHtml: string;
  if (input.action.kind === "link") {
    const hrefEsc = escapeHtmlMail(input.action.href);
    const labelEsc = escapeHtmlMail(input.action.label);
    actionHtml = `<div style="text-align:center;margin:30px 0;">
        <a href="${hrefEsc}"
           style="display:inline-block;background:#e30613;color:#ffffff;padding:15px 25px;text-decoration:none;border-radius:6px;font-weight:bold;">
          ${labelEsc}
        </a>
      </div>`;
  } else {
    const codeEsc = escapeHtmlMail(input.action.code);
    const caption =
      input.action.caption != null && input.action.caption.trim()
        ? `<p style="font-size:14px;color:#444;line-height:1.5;margin:0 0 8px;text-align:center;">${escapeHtmlMail(input.action.caption.trim())}</p>`
        : "";
    actionHtml = `<div style="text-align:center;margin:30px 0;">
        ${caption}
        <p style="font-size:32px;font-weight:800;letter-spacing:0.2em;color:#111;margin:0;font-family:Arial,Helvetica,sans-serif;">${codeEsc}</p>
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;">
  <div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;">
    ${preheader}
  </div>
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;padding:20px;">
    <div style="max-width:500px;margin:auto;background:white;padding:30px;border-radius:10px;">
      ${logoHtml}
      <h2 style="text-align:center;margin:0 0 16px;font-size:20px;color:#111;">${headline}</h2>
      <p style="margin:0 0 12px;line-height:1.5;color:#333;">${input.introHtml}</p>
      ${actionHtml}
      <p style="font-size:12px;color:#888;margin:0;line-height:1.5;">
        ${input.metaHtml}
      </p>
      <p style="font-size:12px;color:#888;margin:16px 0 0;line-height:1.5;border-top:1px solid #e8edf4;padding-top:14px;">
        ${securityNote}
      </p>
    </div>
  </div>
</body></html>`;
}
