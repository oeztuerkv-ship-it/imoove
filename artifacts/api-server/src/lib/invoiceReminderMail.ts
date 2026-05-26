import { escapeHtmlMail, sendOnrodaMail } from "./onrodaSmtpMail.js";

export function resolvePartnerPanelUrl(): string {
  const raw =
    process.env.PARTNER_PANEL_URL?.trim() ||
    process.env.PARTNER_REGISTRATION_PANEL_URL?.trim() ||
    "https://panel.onroda.de";
  return raw.replace(/\/$/, "");
}

export function resolveAppBaseUrl(): string {
  const raw =
    process.env.APP_BASE_URL?.trim() ||
    process.env.OAUTH_PUBLIC_ORIGIN?.trim() ||
    "https://api.onroda.de";
  return raw.replace(/\/$/, "");
}

function fmtDateDe(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(String(iso).includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtMoneyEur(amount: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);
}

export function buildInvoiceReminderMail(input: {
  companyName: string;
  invoiceNumber: string;
  paymentReference: string;
  totalGross: number;
  dueDate: string | null;
  periodFrom: string;
  periodTo: string;
}): { subject: string; text: string; html: string } {
  const company = input.companyName.trim() || "Ihr Unternehmen";
  const ref = input.paymentReference.trim() || input.invoiceNumber;
  const amount = fmtMoneyEur(input.totalGross);
  const due = fmtDateDe(input.dueDate);
  const period = `${fmtDateDe(input.periodFrom)} – ${fmtDateDe(input.periodTo)}`;
  const panelUrl = resolvePartnerPanelUrl();

  const subject = `Onroda: Zahlungserinnerung — Rechnung ${input.invoiceNumber}`;

  const text = [
    `Guten Tag,`,
    "",
    `zu Ihrer Onroda-Rechnung ${input.invoiceNumber} (${company}) haben wir noch keinen Zahlungseingang festgestellt.`,
    "",
    `Abrechnungszeitraum: ${period}`,
    `Rechnungsbetrag: ${amount}`,
    input.dueDate ? `Fällig am: ${due}` : "",
    "",
    "Bitte überweisen Sie den offenen Betrag und geben Sie als Verwendungszweck exakt an:",
    ref,
    "",
    `Rechnung und PDF finden Sie im Partner-Portal: ${panelUrl}`,
    "(Bereich „Abrechnung“)",
    "",
    "Bei Rückfragen antworten Sie gerne auf diese E-Mail.",
    "",
    "Mit freundlichen Grüßen",
    "Ihr Onroda-Team",
  ]
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n");

  const panelEsc = escapeHtmlMail(panelUrl);
  const refEsc = escapeHtmlMail(ref);
  const invEsc = escapeHtmlMail(input.invoiceNumber);

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;">
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;padding:20px;">
    <div style="max-width:520px;margin:auto;background:white;padding:30px;border-radius:10px;">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:28px;font-weight:800;letter-spacing:0.02em;line-height:1.2;">
          <span style="color:#e30613;">On</span><span style="color:#111111;">roda</span>
        </div>
      </div>
      <h2 style="text-align:center;margin:0 0 16px;font-size:20px;color:#111;">Zahlungserinnerung</h2>
      <p style="margin:0 0 12px;line-height:1.55;color:#333;">Guten Tag,</p>
      <p style="margin:0 0 12px;line-height:1.55;color:#333;">
        zu Ihrer Rechnung <strong>${invEsc}</strong> (${escapeHtmlMail(company)}) haben wir noch keinen Zahlungseingang festgestellt.
      </p>
      <p style="margin:0 0 8px;line-height:1.5;color:#555;font-size:14px;">Abrechnungszeitraum: ${escapeHtmlMail(period)}</p>
      <p style="margin:0 0 8px;line-height:1.5;color:#555;font-size:14px;">Rechnungsbetrag: <strong>${escapeHtmlMail(amount)}</strong></p>
      ${input.dueDate ? `<p style="margin:0 0 12px;line-height:1.5;color:#555;font-size:14px;">Fällig am: ${escapeHtmlMail(due)}</p>` : ""}
      <p style="margin:16px 0 8px;line-height:1.55;color:#333;">Bitte verwenden Sie als <strong>Verwendungszweck</strong>:</p>
      <p style="margin:0 0 20px;font-family:monospace;font-size:15px;font-weight:700;color:#111;">${refEsc}</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${panelEsc}"
           style="display:inline-block;background:#e30613;color:#ffffff;padding:14px 22px;text-decoration:none;border-radius:6px;font-weight:bold;">
          Zum Partner-Portal
        </a>
      </div>
      <p style="font-size:12px;color:#888;margin:0;line-height:1.5;">
        Unter „Abrechnung“ können Sie die Rechnung einsehen und als PDF herunterladen.
      </p>
    </div>
  </div>
</body></html>`;

  return { subject, text, html };
}

export async function sendInvoiceReminderMail(input: {
  to: string;
  companyName: string;
  invoiceNumber: string;
  paymentReference: string;
  totalGross: number;
  dueDate: string | null;
  periodFrom: string;
  periodTo: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const bodies = buildInvoiceReminderMail(input);
  return sendOnrodaMail({
    to: input.to,
    subject: bodies.subject,
    text: bodies.text,
    html: bodies.html,
    logEvent: "billing.invoice_reminder_mail.sent",
  });
}
