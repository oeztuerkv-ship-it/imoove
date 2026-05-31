import PDFDocument from "pdfkit";
import { roundMoneyEur } from "./partnerInvoicePdf.js";
import { ONRODA_INVOICE_BRAND } from "./invoiceBrand.js";
import {
  createPdfContext,
  INVOICE_LAYOUT,
  INVOICE_MARGINS,
  INVOICE_PAGE,
  type InvoicePdfContext,
} from "./invoiceLayout.js";
import {
  drawInvoiceFooterOnCurrentPage,
  drawInvoiceMetaBar,
  drawInvoicePageHeader,
  drawInvoiceTableHeader,
  drawInvoiceTableRow,
  drawPartyColumns,
  measureTableRowHeight,
  type InvoiceHeaderMeta,
  type InvoiceTableColumn,
  type InvoiceTableRow,
} from "./invoicePdfComponents.js";
import type { TransportVoucherRow } from "../../db/krankenInvoicesData.js";

export type KrankenInvoicePdfInput = {
  invoiceNumber: string;
  issueDate: string;
  periodFrom: string;
  periodTo: string;
  senderName: string;
  senderLines: string[];
  recipientName: string;
  recipientLines: string[];
  vouchers: TransportVoucherRow[];
  totalAmount: number;
  commissionAmount: number;
  netAmount: number;
  commissionRatePercent: number;
};

function fmtDateDe(iso: string): string {
  const t = iso.trim();
  if (!t) return "—";
  const d = new Date(t.includes("T") ? t : `${t}T12:00:00`);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtMoney(n: number): string {
  return `${roundMoneyEur(n).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function routeShort(from?: string, to?: string): string {
  const a = (from ?? "").trim();
  const b = (to ?? "").trim();
  if (!a && !b) return "—";
  const short = (s: string) => (s.length > 36 ? `${s.slice(0, 33)}…` : s);
  return `${short(a)} → ${short(b)}`;
}

export function renderKrankenInvoicePdf(input: KrankenInvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const headerMeta: InvoiceHeaderMeta = {
      invoiceNumber: input.invoiceNumber,
      statusLabel: "Sammelrechnung Krankenfahrt",
      issueDateLabel: fmtDateDe(input.issueDate),
      periodLabel: `${fmtDateDe(input.periodFrom)} – ${fmtDateDe(input.periodTo)}`,
      dueDateLabel: "—",
    };

    let pageCount = 0;
    doc.addPage({ size: "A4", margin: 0 });
    pageCount = 1;
    let ctx: InvoicePdfContext = createPdfContext(doc, 0);

    const posW = 28;
    const amtW = 62;
    const kmW = 40;
    const dateW = 58;
    const descW = ctx.contentWidth - posW - dateW - kmW - amtW;
    const columns: InvoiceTableColumn[] = [
      { key: "pos", title: "Pos.", width: posW, align: "left" },
      { key: "date", title: "Datum", width: dateW, align: "left" },
      { key: "patient", title: "Patient / Strecke", width: descW, align: "left" },
      { key: "km", title: "km", width: kmW, align: "right" },
      { key: "gross", title: "Betrag", width: amtW, align: "right" },
    ];

    ctx.y = drawInvoicePageHeader(ctx, headerMeta, { compact: false });
    ctx.y = drawInvoiceMetaBar(ctx, headerMeta);
    ctx.y = drawPartyColumns(
      ctx,
      { title: "Rechnungssteller (Taxi)", name: input.senderName, lines: input.senderLines.filter(Boolean) },
      { title: "Rechnungsempfänger (Krankenkasse)", name: input.recipientName, lines: input.recipientLines.filter(Boolean) },
    );

    doc.font("Helvetica").fontSize(9).fillColor(ONRODA_INVOICE_BRAND.muted);
    doc.text("Krankenfahrten — T-Schein-Fahrten im Abrechnungszeitraum", ctx.contentLeft, ctx.y);
    ctx.y += 18;

    ctx.y = drawInvoiceTableHeader(ctx, columns);

    const items = input.vouchers.length ? input.vouchers : [];
    let pos = 0;
    for (const v of items) {
      pos += 1;
      const row: InvoiceTableRow = {
        cells: {
          pos: String(pos),
          date: fmtDateDe(v.rideReferenceAt ?? v.createdAt),
          patient: `${v.patientName}\n${routeShort(v.rideFromFull, v.rideToFull)}`,
          km:
            v.distanceKm != null && Number.isFinite(v.distanceKm)
              ? v.distanceKm.toFixed(1)
              : "—",
          gross: fmtMoney(v.fareAmount),
        },
      };
      const rowH = measureTableRowHeight(doc, row, columns);
      if (ctx.y + rowH > INVOICE_PAGE.height - INVOICE_MARGINS.bottom - INVOICE_LAYOUT.footerHeight) {
        drawInvoiceFooterOnCurrentPage(ctx, pageCount, 0);
        doc.addPage({ size: "A4", margin: 0 });
        pageCount += 1;
        ctx = createPdfContext(doc, pageCount - 1);
        ctx.y = drawInvoicePageHeader(ctx, headerMeta, { compact: true });
        ctx.y = drawInvoiceTableHeader(ctx, columns);
      }
      ctx.y = drawInvoiceTableRow(ctx, columns, { ...row, rowHeight: rowH });
    }

    if (!items.length) {
      const row: InvoiceTableRow = {
        cells: {
          pos: "—",
          date: "—",
          patient: "Keine Fahrten im Zeitraum",
          km: "—",
          gross: fmtMoney(0),
        },
      };
      ctx.y = drawInvoiceTableRow(ctx, columns, row);
    }

    const pctLabel = input.commissionRatePercent.toLocaleString("de-DE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    const boxX = ctx.contentLeft;
    const boxW = ctx.contentWidth;
    const lineH = 16;
    const boxH = lineH * 4 + 20;
    if (ctx.y + boxH > INVOICE_PAGE.height - INVOICE_MARGINS.bottom - INVOICE_LAYOUT.footerHeight) {
      drawInvoiceFooterOnCurrentPage(ctx, pageCount, 0);
      doc.addPage({ size: "A4", margin: 0 });
      pageCount += 1;
      ctx = createPdfContext(doc, pageCount - 1);
      ctx.y = drawInvoicePageHeader(ctx, headerMeta, { compact: true });
    }
    ctx.y += 12;
    doc.roundedRect(boxX, ctx.y, boxW, boxH, 8).fillAndStroke("#F9FAFB", ONRODA_INVOICE_BRAND.border);
    let ty = ctx.y + 12;
    const labelX = boxX + 14;
    const valueX = boxX + boxW - 14;
    const drawLine = (label: string, value: string, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor(ONRODA_INVOICE_BRAND.text);
      doc.text(label, labelX, ty, { width: boxW - 120, align: "left" });
      doc.text(value, labelX, ty, { width: boxW - 28, align: "right" });
      ty += lineH;
    };
    drawLine("Summe Fahrpreise", fmtMoney(input.totalAmount));
    drawLine(`ONRODA Provision (${pctLabel} %)`, fmtMoney(input.commissionAmount));
    drawLine("Auszahlungsbetrag ans Taxi-Unternehmen", fmtMoney(input.netAmount), true);
    doc.font("Helvetica").fontSize(8).fillColor(ONRODA_INVOICE_BRAND.muted);
    doc.text(
      "ONRODA dokumentiert die Abrechnung; Zahlung der Krankenkasse gemäß vertraglicher Vereinbarung.",
      labelX,
      ty + 4,
      { width: boxW - 28 },
    );
    ctx.y += boxH + 8;

    drawInvoiceFooterOnCurrentPage(ctx, pageCount, pageCount);
    doc.end();
  });
}
