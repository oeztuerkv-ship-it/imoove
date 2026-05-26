import PDFDocument from "pdfkit";
import { ONRODA_INVOICE_SELLER, sellerAddressLines } from "./invoiceBrand";
import {
  createPdfContext,
  INVOICE_LAYOUT,
  remainingHeight,
  type InvoicePdfContext,
} from "./invoiceLayout";
import {
  drawBankSection,
  drawInvoiceFooterOnCurrentPage,
  drawInvoiceMetaBar,
  drawInvoicePageHeader,
  drawInvoiceTableHeader,
  drawInvoiceTableRow,
  drawInvoiceTotalsCard,
  drawPartyColumns,
  measureTableRowHeight,
  type InvoiceHeaderMeta,
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
  segmentLabel?: string;
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

function buildHeaderMeta(input: PartnerInvoicePdfDocumentInput): InvoiceHeaderMeta {
  return {
    invoiceNumber: input.invoiceNumber,
    statusLabel: input.statusLabel,
    issueDateLabel: fmtDateDe(input.issueDate),
    periodLabel: `${fmtDateDe(input.periodFrom)} – ${fmtDateDe(input.periodTo)}`,
    dueDateLabel: input.dueDate ? fmtDateDe(input.dueDate) : "—",
  };
}

function tableColumns(contentWidth: number): InvoiceTableColumn[] {
  const posW = 28;
  const amtW = 72;
  const qtyW = 44;
  const descW = contentWidth - posW - qtyW - amtW;
  return [
    { key: "pos", title: "Pos.", width: posW, align: "left" },
    { key: "description", title: "Beschreibung", width: descW, align: "left" },
    { key: "qty", title: "Menge", width: qtyW, align: "right" },
    { key: "gross", title: "Betrag", width: amtW, align: "right" },
  ];
}

function lineItemToRow(item: PartnerInvoicePdfLineItem): InvoiceTableRow {
  return {
    cells: {
      pos: String(item.position),
      description: item.description,
      qty: item.quantity % 1 === 0 ? String(item.quantity) : item.quantity.toFixed(2),
      gross: fmtMoney(item.lineGross),
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

function ensureSpace(state: PageState, needed: number, compactHeader = true): void {
  if (remainingHeight(state.ctx) >= needed) return;
  addPage(state, compactHeader);
  state.ctx.y = drawInvoiceTableHeader(state.ctx, state.columns);
}

export type PartnerInvoicePdfRenderResult = {
  buffer: Buffer;
  pageCount: number;
};

export function renderPartnerInvoicePdf(input: PartnerInvoicePdfDocumentInput): Promise<Buffer> {
  return renderPartnerInvoicePdfWithMeta(input).then((r) => r.buffer);
}

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
    state.columns = tableColumns(state.ctx.contentWidth);

    state.ctx.y = drawInvoicePageHeader(state.ctx, headerMeta, { compact: false });
    state.ctx.y = drawInvoiceMetaBar(state.ctx, headerMeta);

    state.ctx.y = drawPartyColumns(
      state.ctx,
      {
        title: "Rechnungssteller",
        name: ONRODA_INVOICE_SELLER.legalName,
        lines: sellerAddressLines(),
      },
      {
        title: "Rechnungsempfänger",
        name: input.recipientName,
        lines: input.recipientLines.filter(Boolean),
      },
    );

    if (input.segmentLabel?.trim()) {
      doc.font("Helvetica").fontSize(9).fillColor("#6B7280");
      doc.text(`Leistungsart: ${input.segmentLabel.trim()}`, state.ctx.contentLeft, state.ctx.y);
      state.ctx.y += 18;
    }

    state.ctx.y = drawInvoiceTableHeader(state.ctx, state.columns);

    const rows = input.items.length
      ? input.items.map(lineItemToRow)
      : [
          {
            cells: {
              pos: "—",
              description: "Keine Positionen erfasst",
              qty: "—",
              gross: fmtMoney(0),
            },
          },
        ];

    for (const row of rows) {
      const rowH =
        row.rowHeight ??
        measureTableRowHeight(state.doc, row, state.columns);
      ensureSpace(state, rowH + 8, true);
      state.ctx.y = drawInvoiceTableRow(state.ctx, state.columns, { ...row, rowHeight: rowH });
    }

    const taxPct =
      input.taxRatePercent ??
      (input.subtotalNet > 0 ? Math.round((input.vatTotal / input.subtotalNet) * 10000) / 100 : 19);

    ensureSpace(state, 100, true);
    state.ctx.y += 8;
    state.ctx.y = drawInvoiceTotalsCard(state.ctx, {
      netLabel: "Nettobetrag",
      net: fmtMoney(input.subtotalNet),
      vatLabel: `USt. ${taxPct.toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`,
      vat: fmtMoney(input.vatTotal),
      grossLabel: "Gesamtbetrag",
      gross: fmtMoney(input.totalGross),
    });

    ensureSpace(state, 80, true);
    state.ctx.y = drawBankSection(state.ctx, input.invoiceNumber, input.notes);

    drawInvoiceFooterOnCurrentPage(state.ctx, state.pageCount, state.pageCount);

    doc.end();
  });
}
