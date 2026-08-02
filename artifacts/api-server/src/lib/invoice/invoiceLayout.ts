import type PDFDocument from "pdfkit";

export type { PDFDocument };

/** A4 in PDF-Punkten (72 pt = 1 inch). */
export const INVOICE_PAGE = {
  width: 595.28,
  height: 841.89,
} as const;

/** DIN-ähnliche Ränder. */
export const INVOICE_MARGINS = {
  left: 48,
  right: 48,
  top: 40,
  bottom: 48,
} as const;

export const INVOICE_LAYOUT = {
  headerHeight: 72,
  footerHeight: 56,
  metaBoxWidth: 210,
  /** Settlement-/Meta-Leisten (nicht Rechnungs-Meta-Box). */
  metaBarHeight: 44,
  tableHeaderHeight: 26,
  tableRowMinHeight: 28,
  totalsCardWidth: 240,
  sectionGap: 14,
  lineGap: 4,
} as const;

export type InvoicePdfContext = {
  doc: PDFDocument;
  pageIndex: number;
  contentLeft: number;
  contentRight: number;
  contentWidth: number;
  y: number;
};

export function contentBottomY(): number {
  return INVOICE_PAGE.height - INVOICE_MARGINS.bottom - INVOICE_LAYOUT.footerHeight;
}

export function createPdfContext(doc: PDFDocument, pageIndex: number, startY?: number): InvoicePdfContext {
  const contentLeft = INVOICE_MARGINS.left;
  const contentRight = INVOICE_PAGE.width - INVOICE_MARGINS.right;
  return {
    doc,
    pageIndex,
    contentLeft,
    contentRight,
    contentWidth: contentRight - contentLeft,
    y: startY ?? INVOICE_MARGINS.top,
  };
}

export function remainingHeight(ctx: InvoicePdfContext): number {
  return contentBottomY() - ctx.y;
}
