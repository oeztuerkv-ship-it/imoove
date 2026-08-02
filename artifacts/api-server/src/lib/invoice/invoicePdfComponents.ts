import type PDFDocument from "pdfkit";
import {
  ONRODA_INVOICE_BRAND,
  ONRODA_INVOICE_SELLER,
  ONRODA_INVOICE_TAX,
  sellerAddressLines,
} from "./invoiceBrand";
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
  /** Leistungsdatum (Einzeldatum oder Zeitraum-Label). */
  periodLabel: string;
  dueDateLabel: string;
  paymentMethodLabel?: string;
};

export type InvoicePartyBlock = {
  title: string;
  name: string;
  lines: string[];
};

export type InvoiceSellerInfo = {
  name: string;
  lines: string[];
  phone?: string;
  email?: string;
  taxId?: string;
  iban?: string;
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

/** @deprecated — nur Gesamtbetrag im neuen Layout. */
export type InvoiceTotalsBlock = {
  netLabel: string;
  net: string;
  vatLabel: string;
  vat: string;
  grossLabel: string;
  gross: string;
  grossUseAccent?: boolean;
};

function hexColor(doc: PDFDocument, hex: string) {
  doc.fillColor(hex);
}

function drawAccentRule(doc: PDFDocument, left: number, right: number, y: number): void {
  doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(ONRODA_INVOICE_BRAND.accent).stroke();
}

function drawOnrodaWordmark(doc: PDFDocument, x: number, y: number, scale = 1) {
  const onSize = 22 * scale;
  doc.font("Helvetica-Bold");
  hexColor(doc, ONRODA_INVOICE_BRAND.accent);
  doc.fontSize(onSize).text("on", x, y, { continued: true, lineBreak: false });
  hexColor(doc, ONRODA_INVOICE_BRAND.text);
  doc.fontSize(onSize).text("roda", { continued: false, lineBreak: false });
  return y + onSize + 4;
}

export function drawOnrodaLogoBlock(doc: PDFDocument, x: number, y: number, scale = 1): number {
  const logoMaxW = 120 * scale;
  const logoMaxH = 36 * scale;
  const buf = getOnrodaInvoiceLogoBuffer();
  if (buf) {
    try {
      doc.image(buf, x, y, { fit: [logoMaxW, logoMaxH], align: "left", valign: "top" });
      return y + logoMaxH + 4;
    } catch {
      /* fallback */
    }
  }
  return drawOnrodaWordmark(doc, x, y, scale);
}

/** Logo links + RECHNUNG / Nummer rechts + rote Trennlinie. */
export function drawInvoicePageHeader(
  ctx: InvoicePdfContext,
  meta: InvoiceHeaderMeta,
  opts?: { compact?: boolean },
): number {
  const { doc } = ctx;
  const compact = opts?.compact === true;
  const top = compact ? INVOICE_MARGINS.top - 8 : INVOICE_MARGINS.top;
  const left = ctx.contentLeft;
  const right = ctx.contentRight;

  const logoBottom = drawOnrodaLogoBlock(doc, left, top, compact ? 0.75 : 1);

  const titleW = 220;
  const titleX = right - titleW;
  doc.font("Helvetica-Bold").fontSize(compact ? 12 : 16);
  hexColor(doc, ONRODA_INVOICE_BRAND.text);
  doc.text("RECHNUNG", titleX, top, { width: titleW, align: "right" });
  doc.font("Helvetica").fontSize(9);
  hexColor(doc, ONRODA_INVOICE_BRAND.accent);
  doc.text("Rechnungsnummer:", titleX, top + (compact ? 16 : 20), { width: titleW, align: "right" });
  doc.font("Helvetica-Bold").fontSize(compact ? 10 : 11);
  doc.text(meta.invoiceNumber, titleX, top + (compact ? 28 : 34), { width: titleW, align: "right" });

  const lineY = Math.max(logoBottom + 8, top + (compact ? 48 : 58));
  drawAccentRule(doc, left, right, lineY);
  return lineY + INVOICE_LAYOUT.sectionGap;
}

export function defaultSellerInfo(): InvoiceSellerInfo {
  const s = ONRODA_INVOICE_SELLER;
  return {
    name: s.legalName,
    lines: sellerAddressLines(),
    phone: s.phone,
    email: s.email,
    taxId: s.taxId,
    iban: s.iban,
  };
}

/**
 * Links: Rechnungsaussteller (Adresse, Kontakt, Steuernr., IBAN).
 * Rechts: Meta-Box (Rechnungsdatum, Leistungsdatum, Zahlungsziel, Zahlungsart).
 */
export function drawIssuerAndMetaBox(
  ctx: InvoicePdfContext,
  meta: InvoiceHeaderMeta,
  seller: InvoiceSellerInfo = defaultSellerInfo(),
): number {
  const { doc } = ctx;
  const y0 = ctx.y;
  const metaW = INVOICE_LAYOUT.metaBoxWidth;
  const leftW = ctx.contentWidth - metaW - 16;
  const metaX = ctx.contentRight - metaW;

  let ly = y0;
  doc.font("Helvetica-Bold").fontSize(10);
  hexColor(doc, ONRODA_INVOICE_BRAND.accent);
  doc.text("Rechnungsaussteller", ctx.contentLeft, ly, { width: leftW });
  ly += 14;
  doc.font("Helvetica-Bold").fontSize(11);
  hexColor(doc, ONRODA_INVOICE_BRAND.text);
  doc.text(seller.name, ctx.contentLeft, ly, { width: leftW });
  ly += doc.heightOfString(seller.name, { width: leftW }) + 4;
  doc.font("Helvetica").fontSize(9);
  hexColor(doc, "#4B5563");
  for (const line of seller.lines) {
    if (!line.trim()) continue;
    doc.text(line, ctx.contentLeft, ly, { width: leftW });
    ly += 12;
  }
  if (seller.phone?.trim()) {
    doc.text(`Tel. ${seller.phone.trim()}`, ctx.contentLeft, ly, { width: leftW });
    ly += 12;
  }
  if (seller.email?.trim()) {
    doc.text(seller.email.trim(), ctx.contentLeft, ly, { width: leftW });
    ly += 12;
  }
  if (seller.taxId?.trim()) {
    doc.text(`Steuernr.: ${seller.taxId.trim()}`, ctx.contentLeft, ly, { width: leftW });
    ly += 12;
  }
  if (seller.iban?.trim()) {
    doc.text(`IBAN: ${seller.iban.trim()}`, ctx.contentLeft, ly, { width: leftW });
    ly += 12;
  }
  const leftEnd = ly;

  const dueRaw = meta.dueDateLabel.trim();
  const dueValue =
    !dueRaw || dueRaw === "—"
      ? "—"
      : dueRaw.startsWith("bis ")
        ? dueRaw
        : `bis ${dueRaw}`;
  const metaRows = [
    { label: "Rechnungsdatum:", value: meta.issueDateLabel },
    { label: "Leistungsdatum:", value: meta.periodLabel },
    { label: "Zahlungsziel:", value: dueValue },
    {
      label: "Zahlungsart:",
      value: meta.paymentMethodLabel?.trim() || ONRODA_INVOICE_TAX.paymentMethodLabel,
    },
  ];
  const metaPad = 12;
  const metaH = metaPad * 2 + metaRows.length * 18;
  doc.roundedRect(metaX, y0, metaW, metaH, 4).strokeColor(ONRODA_INVOICE_BRAND.border).lineWidth(0.75).stroke();
  let my = y0 + metaPad;
  for (const row of metaRows) {
    doc.font("Helvetica").fontSize(8);
    hexColor(doc, ONRODA_INVOICE_BRAND.muted);
    doc.text(row.label, metaX + metaPad, my, { width: metaW - metaPad * 2 });
    doc.font("Helvetica-Bold").fontSize(9);
    hexColor(doc, ONRODA_INVOICE_BRAND.text);
    doc.text(row.value, metaX + metaPad, my, { width: metaW - metaPad * 2, align: "right" });
    my += 18;
  }

  return Math.max(leftEnd, y0 + metaH) + INVOICE_LAYOUT.sectionGap;
}

export function drawRecipientBlock(
  ctx: InvoicePdfContext,
  recipient: InvoicePartyBlock,
): number {
  const { doc } = ctx;
  let y = ctx.y;
  doc.font("Helvetica").fontSize(8);
  hexColor(doc, ONRODA_INVOICE_BRAND.muted);
  doc.text(recipient.title.toUpperCase(), ctx.contentLeft, y);
  y += 12;
  doc.font("Helvetica-Bold").fontSize(11);
  hexColor(doc, ONRODA_INVOICE_BRAND.text);
  doc.text(recipient.name, ctx.contentLeft, y, { width: ctx.contentWidth });
  y += doc.heightOfString(recipient.name, { width: ctx.contentWidth }) + 3;
  doc.font("Helvetica").fontSize(9);
  hexColor(doc, "#4B5563");
  for (const line of recipient.lines) {
    if (!line.trim()) continue;
    doc.text(line, ctx.contentLeft, y, { width: ctx.contentWidth });
    y += 12;
  }
  return y + INVOICE_LAYOUT.sectionGap;
}

export function drawIntroText(ctx: InvoicePdfContext, text?: string | null): number {
  const { doc } = ctx;
  const body = (text ?? ONRODA_INVOICE_TAX.introText).trim();
  if (!body) return ctx.y;
  doc.font("Helvetica").fontSize(9);
  hexColor(doc, ONRODA_INVOICE_BRAND.text);
  doc.text(body, ctx.contentLeft, ctx.y, { width: ctx.contentWidth });
  const h = doc.heightOfString(body, { width: ctx.contentWidth });
  return ctx.y + h + 12;
}

/** Standard-Spalten: Beschreibung / Menge / Einzelpreis / Gesamt */
export function standardInvoiceTableColumns(contentWidth: number): InvoiceTableColumn[] {
  const qtyW = 48;
  const unitW = 78;
  const totalW = 78;
  const descW = contentWidth - qtyW - unitW - totalW;
  return [
    { key: "description", title: "Beschreibung", width: descW, align: "left" },
    { key: "qty", title: "Menge", width: qtyW, align: "right" },
    { key: "unit", title: "Einzelpreis", width: unitW, align: "right" },
    { key: "total", title: "Gesamt", width: totalW, align: "right" },
  ];
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
    maxH = Math.max(maxH, 20 + subH);
  }
  for (const col of columns) {
    const text = row.cells[col.key] ?? "";
    doc.font(col.align === "right" ? "Helvetica-Bold" : "Helvetica").fontSize(10);
    const h = doc.heightOfString(text, { width: col.width - 8 });
    maxH = Math.max(maxH, 14 + h);
  }
  return maxH;
}

export function drawInvoiceTableHeader(
  ctx: InvoicePdfContext,
  columns: InvoiceTableColumn[],
): number {
  const { doc } = ctx;
  const y = ctx.y;
  const h = INVOICE_LAYOUT.tableHeaderHeight;
  doc.rect(ctx.contentLeft, y, ctx.contentWidth, h).fill(ONRODA_INVOICE_BRAND.surface);
  doc.font("Helvetica-Bold").fontSize(8);
  hexColor(doc, ONRODA_INVOICE_BRAND.text);
  let x = ctx.contentLeft + 6;
  for (const col of columns) {
    doc.text(col.title, x, y + 8, {
      width: col.width - (col === columns[0] ? 6 : 8),
      align: col.align ?? "left",
    });
    x += col.width;
  }
  return y + h + 4;
}

export function drawInvoiceTableRow(
  ctx: InvoicePdfContext,
  columns: InvoiceTableColumn[],
  row: InvoiceTableRow,
): number {
  const { doc } = ctx;
  const y = ctx.y;
  const rowH = row.rowHeight ?? measureTableRowHeight(doc, row, columns);
  let x = ctx.contentLeft + 6;
  for (const col of columns) {
    const align = col.align ?? "left";
    doc.font(align === "right" ? "Helvetica-Bold" : "Helvetica").fontSize(10);
    hexColor(doc, ONRODA_INVOICE_BRAND.text);
    doc.text(row.cells[col.key] ?? "", x, y + 3, {
      width: col.width - (col === columns[0] ? 6 : 8),
      align,
    });
    x += col.width;
  }
  if (row.subline) {
    doc.font("Helvetica").fontSize(8);
    hexColor(doc, ONRODA_INVOICE_BRAND.muted);
    const descCol = columns.find((c) => c.key === "description");
    const subW = descCol ? descCol.width - 8 : ctx.contentWidth - 20;
    doc.text(row.subline, ctx.contentLeft + 6, y + 16, { width: subW });
  }
  const lineY = y + rowH;
  doc
    .moveTo(ctx.contentLeft, lineY)
    .lineTo(ctx.contentRight, lineY)
    .lineWidth(0.4)
    .strokeColor(ONRODA_INVOICE_BRAND.border)
    .stroke();
  return lineY + 2;
}

/** Nur Gesamtbetrag (Referenz-Layout). */
export function drawGrossTotalOnly(
  ctx: InvoicePdfContext,
  grossLabel: string,
  grossFormatted: string,
): number {
  const { doc } = ctx;
  drawAccentRule(doc, ctx.contentLeft, ctx.contentRight, ctx.y);
  const y = ctx.y + 12;
  const cardW = INVOICE_LAYOUT.totalsCardWidth;
  const cardX = ctx.contentRight - cardW;
  const cardH = 36;
  doc.roundedRect(cardX, y, cardW, cardH, 4).fill(ONRODA_INVOICE_BRAND.surface);
  doc.font("Helvetica-Bold").fontSize(10);
  hexColor(doc, ONRODA_INVOICE_BRAND.text);
  doc.text(grossLabel, cardX + 12, y + 11, { width: 100 });
  doc.font("Helvetica-Bold").fontSize(14);
  hexColor(doc, ONRODA_INVOICE_BRAND.text);
  doc.text(grossFormatted, cardX + 12, y + 9, { width: cardW - 24, align: "right" });
  return y + cardH + INVOICE_LAYOUT.sectionGap;
}

export function drawTaxNote(
  ctx: InvoicePdfContext,
  opts?: { vatTotal?: number; vatFormatted?: string; taxRatePercent?: number },
): number {
  const { doc } = ctx;
  let y = ctx.y;
  const vat = opts?.vatTotal ?? 0;
  if (vat > 0.005 && opts?.vatFormatted) {
    const pct =
      opts.taxRatePercent != null
        ? opts.taxRatePercent.toLocaleString("de-DE", { maximumFractionDigits: 2 })
        : "";
    doc.font("Helvetica").fontSize(8);
    hexColor(doc, ONRODA_INVOICE_BRAND.muted);
    const line = pct
      ? `Enthaltene USt. ${pct} %: ${opts.vatFormatted}`
      : `Enthaltene USt.: ${opts.vatFormatted}`;
    doc.text(line, ctx.contentLeft, y, { width: ctx.contentWidth, align: "right" });
    y += 14;
  } else if (ONRODA_INVOICE_TAX.regime === "kleinunternehmer") {
    doc.font("Helvetica").fontSize(8);
    hexColor(doc, ONRODA_INVOICE_BRAND.muted);
    doc.text(ONRODA_INVOICE_TAX.kleinunternehmerNote, ctx.contentLeft, y, {
      width: ctx.contentWidth,
    });
    y += 14;
  }
  return y;
}

/** Block „Zahlungsinformationen“. */
export function drawPaymentInfoSection(
  ctx: InvoicePdfContext,
  opts: {
    paymentReference: string;
    invoiceNumber: string;
    dueDateLabel?: string;
    notes?: string | null;
    accountHolder?: string;
    iban?: string;
  },
): number {
  const { doc } = ctx;
  let y = ctx.y;
  drawAccentRule(doc, ctx.contentLeft, ctx.contentRight, y);
  y += 12;
  doc.font("Helvetica-Bold").fontSize(11);
  hexColor(doc, ONRODA_INVOICE_BRAND.accent);
  doc.text("Zahlungsinformationen", ctx.contentLeft, y);
  y += 16;
  doc.font("Helvetica").fontSize(9);
  hexColor(doc, ONRODA_INVOICE_BRAND.text);
  const due = opts.dueDateLabel?.trim();
  const dueClean = due && due !== "—" ? due.replace(/^bis\s+/i, "") : "";
  const instruct = dueClean
    ? `Bitte überweisen Sie den Rechnungsbetrag bis ${dueClean} unter Angabe des Verwendungszwecks auf das folgende Konto:`
    : "Bitte überweisen Sie den Rechnungsbetrag unter Angabe des Verwendungszwecks auf das folgende Konto:";
  doc.text(instruct, ctx.contentLeft, y, { width: ctx.contentWidth });
  y += doc.heightOfString(instruct, { width: ctx.contentWidth }) + 10;

  const holder = (opts.accountHolder ?? ONRODA_INVOICE_SELLER.legalName).trim();
  const iban = (opts.iban ?? ONRODA_INVOICE_SELLER.iban).trim();
  const ref = opts.paymentReference.trim() || opts.invoiceNumber.trim();

  const kv = (label: string, value: string, accent = false) => {
    doc.font("Helvetica-Bold").fontSize(9);
    hexColor(doc, ONRODA_INVOICE_BRAND.text);
    doc.text(label, ctx.contentLeft, y);
    y += 12;
    doc.font("Helvetica-Bold").fontSize(10);
    hexColor(doc, accent ? ONRODA_INVOICE_BRAND.accent : ONRODA_INVOICE_BRAND.text);
    doc.text(value, ctx.contentLeft, y, { width: ctx.contentWidth });
    y += doc.heightOfString(value, { width: ctx.contentWidth }) + 8;
  };
  kv("Kontoinhaber", holder);
  kv("IBAN", iban);
  kv("Verwendungszweck", ref, true);

  if (opts.notes?.trim()) {
    doc.font("Helvetica").fontSize(8);
    hexColor(doc, ONRODA_INVOICE_BRAND.muted);
    doc.text(opts.notes.trim(), ctx.contentLeft, y, { width: ctx.contentWidth });
    y += 16;
  }
  return y;
}

export function drawInvoiceFooter(
  ctx: InvoicePdfContext,
  pageNum: number,
  pageCount: number,
): void {
  const { doc } = ctx;
  const y = INVOICE_PAGE.height - INVOICE_MARGINS.bottom - 24;
  doc.font("Helvetica").fontSize(8).fillColor(ONRODA_INVOICE_BRAND.muted);
  const center = `${ONRODA_INVOICE_BRAND.productName} · ${ONRODA_INVOICE_SELLER.tradingName} · ${ONRODA_INVOICE_BRAND.website}`;
  doc.text(center, ctx.contentLeft, y, { width: ctx.contentWidth, align: "center" });
  const pageLabel =
    pageCount > 0 && pageCount >= pageNum
      ? `Seite ${pageNum} / ${pageCount}`
      : `Seite ${pageNum}`;
  doc.text(pageLabel, ctx.contentLeft, y + 11, { width: ctx.contentWidth, align: "right" });
}

export function drawInvoiceFooterOnCurrentPage(
  ctx: InvoicePdfContext,
  pageNum: number,
  pageCount: number,
): void {
  drawInvoiceFooter(ctx, pageNum, pageCount);
}

/* ——— Abwärtskompatible Aliase (ältere Aufrufer / Settlement-PDF) ——— */

/** @deprecated Meta steckt in drawIssuerAndMetaBox. */
export function drawInvoiceMetaBar(ctx: InvoicePdfContext, meta: InvoiceHeaderMeta): number {
  return drawIssuerAndMetaBox(ctx, meta);
}

/** @deprecated Empfänger separat; hier nur Empfänger-Block. */
export function drawPartyColumns(
  ctx: InvoicePdfContext,
  _seller: InvoicePartyBlock,
  recipient: InvoicePartyBlock,
): number {
  return drawRecipientBlock(ctx, recipient);
}

/** @deprecated Nutze drawGrossTotalOnly. */
export function drawInvoiceTotalsCard(ctx: InvoicePdfContext, totals: InvoiceTotalsBlock): number {
  return drawGrossTotalOnly(ctx, totals.grossLabel, totals.gross);
}

/** @deprecated Nutze drawPaymentInfoSection. */
export function drawBankSection(
  ctx: InvoicePdfContext,
  opts: { paymentReference: string; invoiceNumber: string; notes?: string | null },
): number {
  return drawPaymentInfoSection(ctx, opts);
}
