import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./client";
import { getPanelCompanyById } from "./panelCompanyData";
import { invoiceItemsTable, invoicesTable } from "./schema";

/** Partner-Panel: Zahlungslage abgeleitet aus `invoices.status` + `due_date`. */
export type PanelInvoicePaymentStatus =
  | "draft"
  | "open"
  | "due"
  | "overdue"
  | "partial"
  | "paid"
  | "cancelled";

export type PanelInvoiceSummary = {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  status: string;
  paymentStatus: PanelInvoicePaymentStatus;
  periodFrom: string;
  periodTo: string;
  subtotalNet: number;
  vatTotal: number;
  totalGross: number;
  issueDate: string;
  dueDate: string | null;
  pdfAvailable: boolean;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PanelInvoiceItem = {
  id: string;
  rideId: string | null;
  itemType: string;
  description: string;
  quantity: number;
  unitNet: number;
  vatRate: number;
  lineNet: number;
  lineVat: number;
  lineGross: number;
  createdAt: string;
};

export type PanelInvoiceDetail = PanelInvoiceSummary & {
  notes: string | null;
  pdfStorageKey: string;
  items: PanelInvoiceItem[];
  recipient: {
    companyId: string;
    companyName: string;
    billingName: string;
    billingLines: string[];
  };
};

function derivePaymentStatus(row: {
  status: string;
  due_date: string | Date | null;
}): PanelInvoicePaymentStatus {
  const status = row.status.trim().toLowerCase();
  if (status === "paid") return "paid";
  if (status === "cancelled") return "cancelled";
  if (status === "draft") return "draft";
  if (status === "partially_paid") return "partial";
  if (status === "overdue") return "overdue";
  const due =
    row.due_date instanceof Date
      ? row.due_date
      : row.due_date
        ? new Date(String(row.due_date))
        : null;
  if (due && !Number.isNaN(due.getTime()) && due < new Date()) {
    if (status === "issued" || status === "partially_paid") return "overdue";
    return "due";
  }
  if (status === "issued") return "open";
  return "open";
}

function statusLabelDe(paymentStatus: PanelInvoicePaymentStatus): string {
  const m: Record<PanelInvoicePaymentStatus, string> = {
    draft: "Entwurf",
    open: "Offen",
    due: "Faellig",
    overdue: "Ueberfaellig",
    partial: "Teilweise bezahlt",
    paid: "Bezahlt",
    cancelled: "Storniert",
  };
  return m[paymentStatus] ?? paymentStatus;
}

function mapItem(row: typeof invoiceItemsTable.$inferSelect): PanelInvoiceItem {
  return {
    id: row.id,
    rideId: row.ride_id ?? null,
    itemType: row.item_type,
    description: row.description,
    quantity: Number(row.quantity),
    unitNet: Number(row.unit_net),
    vatRate: Number(row.vat_rate),
    lineNet: Number(row.line_net),
    lineVat: Number(row.line_vat),
    lineGross: Number(row.line_gross),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapSummary(
  row: typeof invoicesTable.$inferSelect,
  itemCount: number,
): PanelInvoiceSummary {
  const paymentStatus = derivePaymentStatus(row);
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    invoiceType: row.invoice_type,
    status: row.status,
    paymentStatus,
    periodFrom: String(row.billing_period_start),
    periodTo: String(row.billing_period_end),
    subtotalNet: Number(row.subtotal_net),
    vatTotal: Number(row.vat_total),
    totalGross: Number(row.total_gross),
    issueDate: String(row.issue_date),
    dueDate: row.due_date ? String(row.due_date) : null,
    pdfAvailable: Boolean(row.pdf_storage_key?.trim()),
    itemCount,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function panelInvoiceStatusLabel(paymentStatus: PanelInvoicePaymentStatus): string {
  return statusLabelDe(paymentStatus);
}

export async function listPanelInvoicesForCompany(companyId: string): Promise<PanelInvoiceSummary[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      invoice: invoicesTable,
      itemCount: sql<number>`count(${invoiceItemsTable.id})::int`,
    })
    .from(invoicesTable)
    .leftJoin(invoiceItemsTable, eq(invoiceItemsTable.invoice_id, invoicesTable.id))
    .where(eq(invoicesTable.company_id, companyId))
    .groupBy(invoicesTable.id)
    .orderBy(desc(invoicesTable.created_at));
  return rows.map((r) => mapSummary(r.invoice, Number(r.itemCount ?? 0)));
}

export async function getPanelInvoiceForCompany(
  companyId: string,
  invoiceId: string,
): Promise<PanelInvoiceDetail | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.company_id, companyId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const items = await db
    .select()
    .from(invoiceItemsTable)
    .where(eq(invoiceItemsTable.invoice_id, invoiceId))
    .orderBy(invoiceItemsTable.created_at);
  const company = await getPanelCompanyById(companyId);
  const billingLines = company
    ? [
        company.billingAddressLine1,
        company.billingAddressLine2,
        [company.billingPostalCode, company.billingCity].filter(Boolean).join(" "),
        company.billingCountry,
      ].filter((x) => x.trim().length > 0)
    : [];
  const meta = row.metadata_json && typeof row.metadata_json === "object" ? row.metadata_json : {};
  const notes = typeof meta.notes === "string" ? meta.notes : null;
  return {
    ...mapSummary(row, items.length),
    notes,
    pdfStorageKey: row.pdf_storage_key ?? "",
    items: items.map(mapItem),
    recipient: {
      companyId,
      companyName: company?.name ?? companyId,
      billingName: company?.billingName?.trim() || company?.name || companyId,
      billingLines,
    },
  };
}
