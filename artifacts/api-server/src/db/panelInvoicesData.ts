import { and, desc, eq, sql } from "drizzle-orm";
import { resolveInvoicePaymentReference } from "../lib/invoicePaymentReference.js";
import {
  buildPartnerPaymentUi,
  resolveInvoiceWorkflowStatus,
  workflowStatusLabelDe,
  type InvoiceWorkflowStatus,
  type PartnerPaymentUi,
} from "../lib/invoiceWorkflow.js";
import { getDb } from "./client";
import { getPanelCompanyById } from "./panelCompanyData";
import { invoiceItemsTable, invoicesTable } from "./schema";

/** @deprecated Alias — nutze InvoiceWorkflowStatus. */
export type PanelInvoicePaymentStatus = InvoiceWorkflowStatus | "open" | "partial";

export type PanelInvoiceSummary = {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  status: string;
  workflowStatus: InvoiceWorkflowStatus;
  /** Abwärtskompatibel für Partner-UI */
  paymentStatus: string;
  periodFrom: string;
  periodTo: string;
  subtotalNet: number;
  vatTotal: number;
  totalGross: number;
  issueDate: string;
  dueDate: string | null;
  pdfAvailable: boolean;
  itemCount: number;
  paymentReference: string;
  statusLabelDe: string;
  paymentUi: PartnerPaymentUi;
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
  metadata: Record<string, unknown>;
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

function legacyPaymentStatus(workflow: InvoiceWorkflowStatus): string {
  if (workflow === "issued") return "open";
  if (workflow === "partially_paid") return "partial";
  return workflow;
}

function mapItem(row: typeof invoiceItemsTable.$inferSelect): PanelInvoiceItem {
  const metadata =
    row.metadata_json && typeof row.metadata_json === "object"
      ? (row.metadata_json as Record<string, unknown>)
      : {};
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
    metadata,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapSummary(row: typeof invoicesTable.$inferSelect, itemCount: number): PanelInvoiceSummary {
  const workflowStatus = resolveInvoiceWorkflowStatus({
    status: row.status,
    due_date: row.due_date,
  });
  const paymentReference = resolveInvoicePaymentReference({
    invoiceNumber: row.invoice_number,
    storedReference: row.payment_reference,
  });
  const dueDate = row.due_date ? String(row.due_date) : null;
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    invoiceType: row.invoice_type,
    status: row.status,
    workflowStatus,
    paymentStatus: legacyPaymentStatus(workflowStatus),
    periodFrom: String(row.billing_period_start),
    periodTo: String(row.billing_period_end),
    subtotalNet: Number(row.subtotal_net),
    vatTotal: Number(row.vat_total),
    totalGross: Number(row.total_gross),
    issueDate: String(row.issue_date),
    dueDate,
    pdfAvailable: Boolean(row.pdf_storage_key?.trim()),
    itemCount,
    paymentReference,
    statusLabelDe: workflowStatusLabelDe(workflowStatus),
    paymentUi: buildPartnerPaymentUi({
      workflowStatus,
      invoiceNumber: row.invoice_number,
      totalGross: Number(row.total_gross),
      dueDate,
      paymentReference,
    }),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function panelInvoiceStatusLabel(paymentStatus: string): string {
  const legacy = paymentStatus === "open" ? "issued" : paymentStatus === "partial" ? "partially_paid" : paymentStatus;
  return workflowStatusLabelDe(legacy as InvoiceWorkflowStatus);
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
