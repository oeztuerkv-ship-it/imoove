import PDFDocument from "pdfkit";
import { ONRODA_INVOICE_TAX } from "./invoiceBrand";
import {
  createPdfContext,
  remainingHeight,
  type InvoicePdfContext,
} from "./invoiceLayout";
import {
  defaultSellerInfo,
  drawGrossTotalOnly,
  drawIntroText,
  drawInvoiceFooterOnCurrentPage,
  drawInvoicePageHeader,
  drawInvoiceTableHeader,
  drawInvoiceTableRow,
  drawIssuerAndMetaBox,
  drawPaymentInfoSection,
  drawRecipientBlock,
  drawTaxNote,
  measureTableRowHeight,
  standardInvoiceTableColumns,
  type InvoiceHeaderMeta,
  type InvoiceSellerInfo,
  type InvoiceTableColumn,
  type InvoiceTableRow,
} from "./invoicePdfComponents";

export type PartnerInvoicePdfLineItem = {
  position: number;
  description: string;
  subline?: string;
  quantity: number;
  unitNet: number;
  vatRate: number;
  lineNet: number;
  lineVat: number;
  lineGross: number;
};

export type PartnerInvoicePdfDocumentInput = {
  invoiceNumber: string;
  statusLabel: string;
  issueDate: string;
  dueDate: string | null;
  periodFrom: string;
  periodTo: string;
  recipientName: string;
  recipientLines: string[];
  items: PartnerInvoicePdfLineItem[];
  subtotalNet: number;
  vatTotal: number;
  totalGross: number;
  taxRatePercent?: number;
  notes?: string | null;
  /** @deprecated — nicht mehr im Layout (einheitliches Design). */
  segmentLabel?: string;
  paymentReference: string;
  /** Optional: anderer Aussteller (z. B. Taxi bei Kranken-Sammelrechnung). */
  seller?: InvoiceSellerInfo;
  introText?: string | null;
};

function fmtDateDe(iso: string): string {
  const t = iso.trim();
  if (!t) return "—";
  const d = new Date(t.includes("T") ? t : `${t}T12:00:00`);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Kaufmännisch auf 2 Nachkommastellen (Cent). */
export function roundMoneyEur(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function fmtMoney(n: number): string {
  return `${roundMoneyEur(n).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function serviceDateLabel(periodFrom: string, periodTo: string): string {
  const a = fmtDateDe(periodFrom);
  const b = fmtDateDe(periodTo);
  if (a === "—" && b === "—") return "—";
  if (a === b || a === "—") return b;
  if (b === "—") return a;
  return `${a} – ${b}`;
}

function buildHeaderMeta(input: PartnerInvoicePdfDocumentInput): InvoiceHeaderMeta {
  return {
    invoiceNumber: input.invoiceNumber,
    statusLabel: input.statusLabel,
    issueDateLabel: fmtDateDe(input.issueDate),
    periodLabel: serviceDateLabel(input.periodFrom, input.periodTo),
    dueDateLabel: input.dueDate ? fmtDateDe(input.dueDate) : "—",
    paymentMethodLabel: ONRODA_INVOICE_TAX.paymentMethodLabel,
  };
}

function lineItemToRow(item: PartnerInvoicePdfLineItem): InvoiceTableRow {
  const qty = item.quantity > 0 ? item.quantity : 1;
  const unit = roundMoneyEur(item.lineGross / qty);
  return {
    cells: {
      description: item.description,
      qty: qty % 1 === 0 ? String(qty) : qty.toFixed(2),
      unit: fmtMoney(unit),
      total: fmtMoney(item.lineGross),
    },
    subline: item.subline,
  };
}

type PageState = {
  doc: PDFDocument;
  ctx: InvoicePdfContext;
  headerMeta: InvoiceHeaderMeta;
  columns: InvoiceTableColumn[];
  pageCount: number;
};

function addPage(state: PageState, compact: boolean): void {
  drawInvoiceFooterOnCurrentPage(state.ctx, state.pageCount, 0);
  state.doc.addPage({ size: "A4", margin: 0 });
  state.pageCount += 1;
  state.ctx = createPdfContext(state.doc, state.pageCount - 1);
  state.ctx.y = drawInvoicePageHeader(state.ctx, state.headerMeta, { compact });
}

function ensureSpace(state: PageState, needed: number): void {
  if (remainingHeight(state.ctx) >= needed) return;
  addPage(state, true);
  state.ctx.y = drawInvoiceTableHeader(state.ctx, state.columns);
}

export type PartnerInvoicePdfRenderResult = {
  buffer: Buffer;
  pageCount: number;
};

export function renderPartnerInvoicePdf(input: PartnerInvoicePdfDocumentInput): Promise<Buffer> {
  return renderPartnerInvoicePdfWithMeta(input).then((r) => r.buffer);
}

/**
 * Einheitliches ONRODA-Rechnungs-PDF (Referenz-Layout 2026-0521-001).
 * Nummernformat unverändert: ONR-{PREFIX}-YYYY-MM-SEQ.
 */
export function renderPartnerInvoicePdfWithMeta(
  input: PartnerInvoicePdfDocumentInput,
): Promise<PartnerInvoicePdfRenderResult> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () =>
      resolve({
        buffer: Buffer.concat(chunks),
        pageCount: state.pageCount,
      }),
    );
    doc.on("error", reject);

    const headerMeta = buildHeaderMeta(input);
    const state: PageState = {
      doc,
      ctx: createPdfContext(doc, 0),
      headerMeta,
      columns: [],
      pageCount: 0,
    };

    doc.addPage({ size: "A4", margin: 0 });
    state.pageCount = 1;
    state.ctx = createPdfContext(doc, 0);
    state.columns = standardInvoiceTableColumns(state.ctx.contentWidth);

    state.ctx.y = drawInvoicePageHeader(state.ctx, headerMeta, { compact: false });
    state.ctx.y = drawIssuerAndMetaBox(state.ctx, headerMeta, input.seller ?? defaultSellerInfo());
    state.ctx.y = drawRecipientBlock(state.ctx, {
      title: "Rechnungsempfänger",
      name: input.recipientName,
      lines: input.recipientLines.filter(Boolean),
    });
    state.ctx.y = drawIntroText(state.ctx, input.introText);

    state.ctx.y = drawInvoiceTableHeader(state.ctx, state.columns);

    const rows = input.items.length
      ? input.items.map(lineItemToRow)
      : [
          {
            cells: {
              description: "Keine Positionen erfasst",
              qty: "—",
              unit: "—",
              total: fmtMoney(0),
            },
          },
        ];

    for (const row of rows) {
      const rowH = row.rowHeight ?? measureTableRowHeight(state.doc, row, state.columns);
      ensureSpace(state, rowH + 8);
      state.ctx.y = drawInvoiceTableRow(state.ctx, state.columns, { ...row, rowHeight: rowH });
    }

    ensureSpace(state, 120);
    state.ctx.y += 6;
    state.ctx.y = drawGrossTotalOnly(state.ctx, "Gesamtbetrag", fmtMoney(input.totalGross));
    state.ctx.y = drawTaxNote(state.ctx, {
      vatTotal: input.vatTotal,
      vatFormatted: fmtMoney(input.vatTotal),
      taxRatePercent: input.taxRatePercent,
    });

    ensureSpace(state, 140);
    state.ctx.y = drawPaymentInfoSection(state.ctx, {
      paymentReference: input.paymentReference,
      invoiceNumber: input.invoiceNumber,
      dueDateLabel: headerMeta.dueDateLabel,
      notes: input.notes,
      accountHolder: input.seller?.name,
      iban: input.seller?.iban,
    });

    drawInvoiceFooterOnCurrentPage(state.ctx, state.pageCount, state.pageCount);
    doc.end();
  });
}
