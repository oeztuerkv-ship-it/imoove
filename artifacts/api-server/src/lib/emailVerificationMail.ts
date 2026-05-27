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

  const text = `Dein ONRODA Bestätigungscode: ${sixDigitCode}\n\nDer Code ist 10 Minuten gültig.\n\nFalls du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.\n\nONRODA · Ein Angebot von Öztürk Taxiunternehmen`;

  const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F2F2F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F2F7;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:520px;width:100%;">
        <tr>
          <td style="padding:32px 40px 24px;border-bottom:1px solid #f0f0f0;">
            <div style="font-size:24px;font-weight:800;letter-spacing:-1px;">
              <span style="color:#EF1D26;">on</span><span style="color:#1c1c1e;">roda</span>
            </div>
            <div style="font-size:11px;color:#999;margin-top:2px;">Ein Angebot von Öztürk Taxiunternehmen</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px 24px;">
            <p style="font-size:16px;color:#1c1c1e;margin:0 0 8px;">Hallo,</p>
            <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 28px;">bitte bestätige deine E-Mail-Adresse mit folgendem Code:</p>
            <div style="background:#F2F2F7;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
              <div style="font-size:42px;font-weight:800;letter-spacing:10px;color:#EF1D26;">${sixDigitCode}</div>
              <div style="font-size:12px;color:#999;margin-top:8px;">Gültig für 10 Minuten</div>
            </div>
            <p style="font-size:13px;color:#999;line-height:1.6;margin:0;">Falls du diese Anfrage nicht gestellt hast, kannst du diese E-Mail einfach ignorieren.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #f0f0f0;text-align:center;">
            <p style="font-size:11px;color:#bbb;margin:0;">ONRODA · Ein Angebot von Öztürk Taxiunternehmen · onroda.de</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const transport = nodemailer.createTransport(smtpUrl);
    await transport.sendMail({
      from,
      to: r,
      subject: "ONRODA Bestätigungscode",
      text,
      html,
    });
    logger.info({ to: r, event: "email_verification.sent" }, "verification email sent");
    return { ok: true };
  } catch (err) {
    logger.warn({ err, to: r }, "email verification send failed");
    return { ok: false, reason: "send_failed" };
  }
}
