/**
 * Serverseitige PDF-Erzeugung für Monats-/Partner-Rechnungen (`invoices` / `invoice_items`).
 * Layout-Referenz: Admin `InvoicesPage` Print-View + `docs/onroda-invoice-billing-architecture.md`
 */

import {
  renderPartnerInvoicePdf,
  type PartnerInvoicePdfDocumentInput,
  type PartnerInvoicePdfLineItem,
} from "./invoice/partnerInvoicePdf.js";

export type { PartnerInvoicePdfDocumentInput, PartnerInvoicePdfLineItem };

/** @deprecated Nutze PartnerInvoicePdfLineItem — Alias für bestehende Aufrufer. */
export type PartnerInvoicePdfItem = {
  description: string;
  detail?: string;
  lineGross: number;
  quantity?: number;
  unitNet?: number;
  vatRate?: number;
  lineNet?: number;
  lineVat?: number;
  position?: number;
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
  taxRatePercent?: number;
  notes?: string | null;
  segmentLabel?: string;
};

function pdfEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildLegacyTextPdf(lines: string[]): Buffer {
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

function mapLineItems(items: PartnerInvoicePdfItem[]): PartnerInvoicePdfLineItem[] {
  return items.map((item, index) => ({
    position: item.position ?? index + 1,
    description: item.description,
    subline: item.detail,
    quantity: item.quantity ?? 1,
    unitNet: item.unitNet ?? item.lineGross,
    vatRate: item.vatRate ?? 0,
    lineNet: item.lineNet ?? item.lineGross,
    lineVat: item.lineVat ?? 0,
    lineGross: item.lineGross,
  }));
}

function toDocumentInput(input: PartnerInvoicePdfInput): PartnerInvoicePdfDocumentInput {
  return {
    invoiceNumber: input.invoiceNumber,
    statusLabel: input.statusLabel,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    recipientName: input.recipientName,
    recipientLines: input.recipientLines,
    items: mapLineItems(input.items),
    subtotalNet: input.subtotalNet,
    vatTotal: input.vatTotal,
    totalGross: input.totalGross,
    taxRatePercent: input.taxRatePercent,
    notes: input.notes,
    segmentLabel: input.segmentLabel,
  };
}

/** Einfaches Text-PDF (z. B. Einzelfahrt-Rechnung im Panel) — bewusst schlicht. */
export function buildSimpleTextInvoicePdf(lines: string[]): Buffer {
  return buildLegacyTextPdf(lines);
}

/** B2B-Monatsrechnung (Hotel / Corporate / Medical / Voucher) — ONRODA Corporate Layout. */
export async function buildPartnerMonthlyInvoicePdf(input: PartnerInvoicePdfInput): Promise<Buffer> {
  return renderPartnerInvoicePdf(toDocumentInput(input));
}
