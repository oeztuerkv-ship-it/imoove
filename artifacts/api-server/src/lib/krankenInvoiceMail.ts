import { escapeHtmlMail, sendOnrodaMail } from "./onrodaSmtpMail.js";

export function buildKrankenInvoiceMail(input: {
  companyName: string;
  invoiceNumber: string;
  insurerName: string;
  periodFrom: string;
  periodTo: string;
  totalAmount: string;
}): { subject: string; text: string; html: string } {
  const company = input.companyName.trim() || "Taxi-Unternehmen";
  const period = `${input.periodFrom} – ${input.periodTo}`;
  const subject = `Sammelrechnung Krankenfahrt ${input.invoiceNumber} — ${company}`;

  const text = [
    "Guten Tag,",
    "",
    `anbei die Sammelrechnung Krankenfahrten (${input.invoiceNumber}) von ${company} für ${input.insurerName}.`,
    "",
    `Abrechnungszeitraum: ${period}`,
    `Rechnungsbetrag (Fahrpreise): ${input.totalAmount}`,
    "",
    "Das PDF ist dieser E-Mail beigefügt.",
    "",
    "Mit freundlichen Grüßen",
    company,
    "(übermittelt über ONRODA)",
  ].join("\n");

  const html = `<!DOCTYPE html><html lang="de"><body style="font-family:Arial,sans-serif;line-height:1.5">
<p>Guten Tag,</p>
<p>anbei die Sammelrechnung <strong>${escapeHtmlMail(input.invoiceNumber)}</strong> von
<strong>${escapeHtmlMail(company)}</strong> für <strong>${escapeHtmlMail(input.insurerName)}</strong>.</p>
<p>Zeitraum: ${escapeHtmlMail(period)}<br/>Fahrpreise gesamt: ${escapeHtmlMail(input.totalAmount)}</p>
<p>Das PDF ist dieser E-Mail beigefügt.</p>
<p>Mit freundlichen Grüßen<br/>${escapeHtmlMail(company)}<br/><span style="color:#64748b">(übermittelt über ONRODA)</span></p>
</body></html>`;

  return { subject, text, html };
}

export async function sendKrankenInvoiceMail(input: {
  to: string;
  companyName: string;
  invoiceNumber: string;
  insurerName: string;
  periodFrom: string;
  periodTo: string;
  totalAmount: string;
  pdfBuffer: Buffer;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const mail = buildKrankenInvoiceMail(input);
  return sendOnrodaMail({
    to: input.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    logEvent: "kranken_invoice.sent",
    attachments: [
      {
        filename: `${input.invoiceNumber.replace(/[^\w-]+/g, "_")}.pdf`,
        content: input.pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}
