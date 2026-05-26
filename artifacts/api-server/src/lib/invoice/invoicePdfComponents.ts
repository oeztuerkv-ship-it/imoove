import type PDFDocument from "pdfkit";
import { ONRODA_INVOICE_BRAND, ONRODA_INVOICE_SELLER, sellerAddressLines } from "./invoiceBrand";
import { getOnrodaInvoiceLogoBuffer } from "./invoiceLogoAsset.js";
import {
  INVOICE_LAYOUT,
  INVOICE_MARGINS,
  INVOICE_PAGE,
  type InvoicePdfContext,
} from "./invoiceLayout";

export type InvoiceHeaderMeta = {
  invoiceNumber: string;
  statusLabel: string;
  issueDateLabel: string;
  periodLabel: string;
  dueDateLabel: string;
};

export type InvoicePartyBlock = {
  title: string;
  name: string;
  lines: string[];
};

export type InvoiceTableColumn = {
  key: string;
  title: string;
  width: number;
  align?: "left" | "right" | "center";
};

export type InvoiceTableRow = {
  cells: Record<string, string>;
  subline?: string;
  rowHeight?: number;
};

export type InvoiceTotalsBlock = {
  netLabel: string;
  net: string;
  vatLabel: string;
  vat: string;
  grossLabel: string;
  gross: string;
};

function hexColor(doc: PDFDocument, hex: string) {
  doc.fillColor(hex);
}

function drawOnrodaWordmark(doc: PDFDocument, x: number, y: number, scale = 1) {
  const onSize = 26 * scale;
  const rodaSize = 26 * scale;
  doc.font("Helvetica-Bold");
  hexColor(doc, ONRODA_INVOICE_BRAND.accent);
  doc.fontSize(onSize).text("on", x, y, { continued: true, lineBreak: false });
  hexColor(doc, ONRODA_INVOICE_BRAND.text);
  doc.fontSize(rodaSize).text("roda", { continued: false, lineBreak: false });
  doc.font("Helvetica");
  hexColor(doc, ONRODA_INVOICE_BRAND.muted);
  doc.fontSize(9 * scale).text(
    `Plattform · ${ONRODA_INVOICE_SELLER.tradingName}`,
    x,
    y + onSize + 2,
  );
  return y + onSize + 14;
}

/** App-Logo (PNG/JPEG) + Unterzeile; Fallback auf Text-Wordmark. Gibt Y unter dem Block zurück. */
function drawOnrodaLogoBlock(doc: PDFDocument, x: number, y: number, scale = 1): number {
  const logoMaxW = 128 * scale;
  const logoMaxH = 42 * scale;
  const buf = getOnrodaInvoiceLogoBuffer();

  if (buf) {
    doc.image(buf, x, y, { fit: [logoMaxW, logoMaxH], align: "left", valign: "top" });
    const subtitleY = y + logoMaxH + 4;
    doc.font("Helvetica");
    hexColor(doc, ONRODA_INVOICE_BRAND.muted);
    doc.fontSize(9 * scale).text(`Plattform · ${ONRODA_INVOICE_SELLER.tradingName}`, x, subtitleY);
    return subtitleY + 12;
  }

  return drawOnrodaWordmark(doc, x, y, scale);
}

/** Großes Logo + RECHNUNG-Titel (Seite 1 oder Folgeseiten kompakt). */
export function drawInvoicePageHeader(
  ctx: InvoicePdfContext,
  meta: InvoiceHeaderMeta,
  opts?: { compact?: boolean },
): number {
  const { doc } = ctx;
  const compact = opts?.compact === true;
  const top = INVOICE_MARGINS.top;
  const left = ctx.contentLeft;
  const right = ctx.contentRight;

  const logoScale = compact ? 0.72 : 1;
  const logoBottom = drawOnrodaLogoBlock(doc, left, compact ? top - 4 : top, logoScale);

  const titleX = right - 160;
  doc.font("Helvetica-Bold").fontSize(compact ? 11 : 14);
  hexColor(doc, ONRODA_INVOICE_BRAND.text);
  doc.text("RECHNUNG", titleX, top, { width: 160, align: "right" });
  doc.font("Helvetica-Bold").fontSize(compact ? 10 : 12);
  hexColor(doc, ONRODA_INVOICE_BRAND.accent);
  doc.text(meta.invoiceNumber, titleX, top + (compact ? 14 : 18), { width: 160, align: "right" });

  if (!compact) {
    const badgeY = top + 40;
    doc.roundedRect(right - 92, badgeY, 92, 22, 11).fillOpacity(0.08).fill(ONRODA_INVOICE_BRAND.accent).fillOpacity(1);
    doc.font("Helvetica-Bold").fontSize(9);
    hexColor(doc, ONRODA_INVOICE_BRAND.accent);
    doc.text(meta.statusLabel.toUpperCase(), right - 92, badgeY + 6, { width: 92, align: "center" });
  }

  const lineY = Math.max(logoBottom + 6, top + (compact ? 36 : INVOICE_LAYOUT.headerHeight - 8));
  doc.moveTo(left, lineY).lineTo(right, lineY).lineWidth(0.5).strokeColor(ONRODA_INVOICE_BRAND.border).stroke();

  return lineY + INVOICE_LAYOUT.sectionGap;
}

/** Graue Meta-Leiste (Datum, Zeitraum, Zahlungsziel). */
export function drawInvoiceMetaBar(ctx: InvoicePdfContext, meta: InvoiceHeaderMeta): number {
  const { doc } = ctx;
  const y = ctx.y;
  const h = INVOICE_LAYOUT.metaBarHeight;
  doc.roundedRect(ctx.contentLeft, y, ctx.contentWidth, h, 6).fill(ONRODA_INVOICE_BRAND.surface);

  const colW = ctx.contentWidth / 3;
  const items = [
    { label: "Rechnungsdatum", value: meta.issueDateLabel },
    { label: "Leistungszeitraum", value: meta.periodLabel },
    { label: "Zahlungsziel", value: meta.dueDateLabel },
  ];
  items.forEach((item, i) => {
    const x = ctx.contentLeft + 14 + i * colW;
    doc.font("Helvetica").fontSize(8);
    hexColor(doc, ONRODA_INVOICE_BRAND.muted);
    doc.text(item.label.toUpperCase(), x, y + 10, { width: colW - 20 });
    doc.font("Helvetica-Bold").fontSize(10);
    hexColor(doc, ONRODA_INVOICE_BRAND.text);
    doc.text(item.value, x, y + 22, { width: colW - 20 });
  });

  return y + h + INVOICE_LAYOUT.sectionGap;
}

export function drawPartyColumns(
  ctx: InvoicePdfContext,
  seller: InvoicePartyBlock,
  recipient: InvoicePartyBlock,
): number {
  const { doc } = ctx;
  const y = ctx.y;
  const colW = (ctx.contentWidth - 16) / 2;

  const drawBlock = (block: InvoicePartyBlock, x: number) => {
    let ly = y;
    doc.font("Helvetica").fontSize(8);
    hexColor(doc, ONRODA_INVOICE_BRAND.muted);
    doc.text(block.title.toUpperCase(), x, ly, { width: colW });
    ly += 12;
    doc.font("Helvetica-Bold").fontSize(11);
    hexColor(doc, ONRODA_INVOICE_BRAND.text);
    const nameH = doc.heightOfString(block.name, { width: colW });
    doc.text(block.name, x, ly, { width: colW });
    ly += nameH + 4;
    doc.font("Helvetica").fontSize(10);
    hexColor(doc, "#4B5563");
    for (const line of block.lines) {
      const lineH = doc.heightOfString(line, { width: colW });
      doc.text(line, x, ly, { width: colW });
      ly += lineH + 2;
    }
    if (block.title.toLowerCase().includes("steller")) {
      doc.fontSize(9).fillColor(ONRODA_INVOICE_BRAND.muted);
      const taxLine = `St.-Nr. ${ONRODA_INVOICE_SELLER.taxId}`;
      const taxH = doc.heightOfString(taxLine, { width: colW });
      doc.text(taxLine, x, ly + 2, { width: colW });
      ly += taxH + 4;
    }
    return ly;
  };

  const leftEnd = drawBlock(seller, ctx.contentLeft);
  const rightEnd = drawBlock(recipient, ctx.contentLeft + colW + 16);
  return Math.max(leftEnd, rightEnd) + INVOICE_LAYOUT.sectionGap;
}

export function measureTableRowHeight(
  doc: PDFDocument,
  row: InvoiceTableRow,
  columns: InvoiceTableColumn[],
): number {
  let maxH = INVOICE_LAYOUT.tableRowMinHeight;
  const descCol = columns.find((c) => c.key === "description");
  const descW = descCol ? descCol.width - 8 : 200;
  if (row.subline) {
    doc.font("Helvetica").fontSize(8);
    const subH = doc.heightOfString(row.subline, { width: descW });
    maxH = Math.max(maxH, 22 + subH);
  }
  for (const col of columns) {
    const text = row.cells[col.key] ?? "";
    doc.font(col.align === "right" ? "Helvetica-Bold" : "Helvetica").fontSize(10);
    const colW = col.width - 8;
    const h = doc.heightOfString(text, { width: colW });
    maxH = Math.max(maxH, 16 + h);
  }
  return maxH;
}

export function drawInvoiceTableHeader(
  ctx: InvoicePdfContext,
  columns: InvoiceTableColumn[],
): number {
  const { doc } = ctx;
  const y = ctx.y;
  doc.font("Helvetica").fontSize(8);
  hexColor(doc, ONRODA_INVOICE_BRAND.muted);
  let x = ctx.contentLeft;
  for (const col of columns) {
    doc.text(col.title.toUpperCase(), x, y, {
      width: col.width,
      align: col.align ?? "left",
    });
    x += col.width;
  }
  const lineY = y + INVOICE_LAYOUT.tableHeaderHeight - 6;
  doc.moveTo(ctx.contentLeft, lineY).lineTo(ctx.contentRight, lineY).lineWidth(0.5).strokeColor(ONRODA_INVOICE_BRAND.border).stroke();
  return lineY + 8;
}

export function drawInvoiceTableRow(
  ctx: InvoicePdfContext,
  columns: InvoiceTableColumn[],
  row: InvoiceTableRow,
): number {
  const { doc } = ctx;
  const y = ctx.y;
  const rowH = row.rowHeight ?? measureTableRowHeight(doc, row, columns);
  let x = ctx.contentLeft;
  for (const col of columns) {
    const align = col.align ?? "left";
    doc.font(align === "right" ? "Helvetica-Bold" : "Helvetica").fontSize(10);
    hexColor(doc, col.key === "pos" ? ONRODA_INVOICE_BRAND.muted : ONRODA_INVOICE_BRAND.text);
    doc.text(row.cells[col.key] ?? "", x, y + 4, { width: col.width - 6, align });
    x += col.width;
  }
  if (row.subline) {
    doc.font("Helvetica").fontSize(8);
    hexColor(doc, ONRODA_INVOICE_BRAND.muted);
    const descCol = columns.find((c) => c.key === "description");
    const subX = descCol ? ctx.contentLeft + (columns[0]?.width ?? 0) : ctx.contentLeft + 32;
    const subW = descCol ? descCol.width - 8 : ctx.contentWidth - 40;
    doc.text(row.subline, subX, y + 18, { width: subW });
  }
  const lineY = y + rowH;
  doc
    .moveTo(ctx.contentLeft, lineY)
    .lineTo(ctx.contentRight, lineY)
    .lineWidth(0.25)
    .strokeColor("#F0F0F2")
    .stroke();
  return lineY + 4;
}

/** Summen-Karte rechts + großer Gesamtbetrag. */
export function drawInvoiceTotalsCard(ctx: InvoicePdfContext, totals: InvoiceTotalsBlock): number {
  const { doc } = ctx;
  const cardW = INVOICE_LAYOUT.totalsCardWidth;
  const cardX = ctx.contentRight - cardW;
  const y = ctx.y;
  const cardH = 88;

  doc.roundedRect(cardX, y, cardW, cardH, 8).fill(ONRODA_INVOICE_BRAND.surface);

  const row = (label: string, value: string, yy: number, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 10);
    hexColor(doc, bold ? ONRODA_INVOICE_BRAND.text : ONRODA_INVOICE_BRAND.muted);
    doc.text(label, cardX + 14, yy, { width: cardW - 90, align: "left" });
    hexColor(doc, ONRODA_INVOICE_BRAND.text);
    doc.text(value, cardX + 14, yy, { width: cardW - 28, align: "right" });
  };

  row(totals.netLabel, totals.net, y + 12);
  row(totals.vatLabel, totals.vat, y + 30);
  doc
    .moveTo(cardX + 12, y + 48)
    .lineTo(cardX + cardW - 12, y + 48)
    .lineWidth(0.5)
    .strokeColor(ONRODA_INVOICE_BRAND.border)
    .stroke();
  doc.font("Helvetica").fontSize(9);
  hexColor(doc, ONRODA_INVOICE_BRAND.muted);
  doc.text(totals.grossLabel, cardX + 14, y + 54, { width: cardW - 28, align: "left" });
  doc.font("Helvetica-Bold").fontSize(16);
  hexColor(doc, ONRODA_INVOICE_BRAND.accent);
  doc.text(totals.gross, cardX + 14, y + 66, { width: cardW - 28, align: "right" });

  return y + cardH + INVOICE_LAYOUT.sectionGap;
}

export function drawBankSection(
  ctx: InvoicePdfContext,
  opts: { paymentReference: string; invoiceNumber: string; notes?: string | null },
): number {
  const { doc } = ctx;
  const y = ctx.y;
  const paymentReference = opts.paymentReference.trim() || opts.invoiceNumber.trim();
  doc
    .moveTo(ctx.contentLeft, y)
    .lineTo(ctx.contentRight, y)
    .lineWidth(0.5)
    .strokeColor(ONRODA_INVOICE_BRAND.border)
    .stroke();

  let ly = y + 12;
  doc.font("Helvetica-Bold").fontSize(10);
  hexColor(doc, ONRODA_INVOICE_BRAND.text);
  doc.text("Bankverbindung", ctx.contentLeft, ly);
  ly += 16;
  doc.font("Helvetica").fontSize(9);
  hexColor(doc, "#4B5563");
  doc.text(`IBAN: ${ONRODA_INVOICE_SELLER.iban} · ${ONRODA_INVOICE_SELLER.legalName}`, ctx.contentLeft, ly, {
    width: ctx.contentWidth,
  });
  ly += 14;
  doc.font("Helvetica-Bold").fontSize(9);
  hexColor(doc, ONRODA_INVOICE_BRAND.text);
  doc.text("Verwendungszweck", ctx.contentLeft, ly);
  ly += 12;
  doc.font("Helvetica-Bold").fontSize(10);
  hexColor(doc, ONRODA_INVOICE_BRAND.accent);
  doc.text(paymentReference, ctx.contentLeft, ly, { width: ctx.contentWidth });
  ly += doc.heightOfString(paymentReference, { width: ctx.contentWidth }) + 8;
  if (opts.notes?.trim()) {
    doc.font("Helvetica").fontSize(9).fillColor(ONRODA_INVOICE_BRAND.muted);
    doc.text(`Hinweis: ${opts.notes.trim()}`, ctx.contentLeft, ly, { width: ctx.contentWidth });
    ly += 20;
  }
  return ly;
}

export function drawInvoiceFooter(
  ctx: InvoicePdfContext,
  pageNum: number,
  pageCount: number,
): void {
  const { doc } = ctx;
  const y = INVOICE_PAGE.height - INVOICE_MARGINS.bottom - 28;
  doc.font("Helvetica").fontSize(8).fillColor(ONRODA_INVOICE_BRAND.muted);
  const center = `${ONRODA_INVOICE_BRAND.productName} · ${ONRODA_INVOICE_SELLER.tradingName} · ${ONRODA_INVOICE_BRAND.website}`;
  doc.text(center, ctx.contentLeft, y, { width: ctx.contentWidth, align: "center" });
  const pageLabel =
    pageCount > 0 && pageCount >= pageNum
      ? `Seite ${pageNum} / ${pageCount}`
      : `Seite ${pageNum}`;
  doc.text(pageLabel, ctx.contentLeft, y + 12, { width: ctx.contentWidth, align: "right" });
}

/** Footer am unteren Seitenrand — ohne switchToPage (aktuelle Seite). */
export function drawInvoiceFooterOnCurrentPage(
  ctx: InvoicePdfContext,
  pageNum: number,
  pageCount: number,
): void {
  drawInvoiceFooter(
    { ...ctx, y: INVOICE_PAGE.height - INVOICE_MARGINS.bottom - INVOICE_LAYOUT.footerHeight },
    pageNum,
    pageCount,
  );
}
