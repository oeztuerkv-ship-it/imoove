/**
 * Serverseitige PDF-Erzeugung für Monats-/Partner-Rechnungen (`invoices` / `invoice_items`).
 * Kein Browser-Fake-PDF — Auslieferung über GET /panel/v1/invoices/:id/pdf.
 */

export type PartnerInvoicePdfItem = {
  description: string;
  detail?: string;
  lineGross: number;
};

export type PartnerInvoicePdfInput = {
  invoiceNumber: string;
  statusLabel: string;
  issueDate: string;
  dueDate: string | null;
  periodFrom: string;
  periodTo: string;
  recipientName: string;
  recipientLines: string[];
  items: PartnerInvoicePdfItem[];
  subtotalNet: number;
  vatTotal: number;
  totalGross: number;
  notes?: string | null;
};

function pdfEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function moneyDe(n: number): string {
  return `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function buildPdfFromLines(lines: string[]): Buffer {
  const content = [
    "BT",
    "/F1 11 Tf",
    "50 780 Td",
    ...lines.flatMap((line, idx) =>
      idx === 0 ? [`(${pdfEscape(line)}) Tj`] : ["0 -14 Td", `(${pdfEscape(line)}) Tj`],
    ),
    "ET",
  ].join("\n");
  const contentBytes = Buffer.from(content, "utf8");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    `4 0 obj << /Length ${contentBytes.length} >> stream\n${content}\nendstream endobj`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${obj}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

/** Einfaches Text-PDF (z. B. Einzelfahrt-Rechnung im Panel). */
export function buildSimpleTextInvoicePdf(lines: string[]): Buffer {
  return buildPdfFromLines(lines);
}

export function buildPartnerMonthlyInvoicePdf(input: PartnerInvoicePdfInput): Buffer {
  const lines: string[] = [
    "ONRODA — Monatsrechnung",
    `Rechnungsnummer: ${input.invoiceNumber}`,
    `Status: ${input.statusLabel}`,
    `Rechnungsdatum: ${input.issueDate}`,
    `Zahlungsziel: ${input.dueDate ?? "—"}`,
    `Abrechnungszeitraum: ${input.periodFrom} bis ${input.periodTo}`,
    "",
    "Rechnungsempfaenger:",
    input.recipientName,
    ...input.recipientLines.filter(Boolean),
    "",
    "Positionen:",
  ];
  for (const item of input.items) {
    lines.push(`- ${item.description}${item.detail ? ` (${item.detail})` : ""}: ${moneyDe(item.lineGross)}`);
  }
  lines.push(
    "",
    `Netto: ${moneyDe(input.subtotalNet)}`,
    `MwSt.: ${moneyDe(input.vatTotal)}`,
    `Gesamt brutto: ${moneyDe(input.totalGross)}`,
  );
  if (input.notes?.trim()) {
    lines.push("", `Hinweis: ${input.notes.trim()}`);
  }
  lines.push("", "Erstellt ueber api.onroda.de — Plattform ONRODA");
  return buildPdfFromLines(lines);
}
