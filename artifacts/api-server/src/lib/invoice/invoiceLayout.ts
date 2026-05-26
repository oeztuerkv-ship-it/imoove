import type PDFDocument from "pdfkit";

export type { PDFDocument };

/** A4 in PDF-Punkten (72 pt = 1 inch). */
export const INVOICE_PAGE = {
  width: 595.28,
  height: 841.89,
} as const;

/** DIN-ähnliche Ränder (~20 mm Seite, ~15 mm oben/unten Inhalt). */
export const INVOICE_MARGINS = {
  left: 50,
  right: 50,
  top: 52,
  bottom: 56,
} as const;

export const INVOICE_LAYOUT = {
  headerHeight: 88,
  footerHeight: 72,
  metaBarHeight: 44,
  tableHeaderHeight: 22,
  tableRowMinHeight: 36,
  totalsCardWidth: 220,
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

export function contentTopY(): number {
  return INVOICE_MARGINS.top + INVOICE_LAYOUT.headerHeight;
}

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
    y: startY ?? contentTopY(),
  };
}

export function remainingHeight(ctx: InvoicePdfContext): number {
  return contentBottomY() - ctx.y;
}
