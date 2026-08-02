import { and, asc, desc, eq, ne, notInArray, sql } from "drizzle-orm";
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

/** Metadata `source` aus dem Wochenlauf (P6) — Provisionsnachzahlung bei Negativsaldo. */
export const WEEKLY_COMMISSION_INVOICE_SOURCE = "cash_card_netting_weekly_commission";

export type OpenCommissionDebtSummary = {
  invoiceId: string;
  invoiceNumber: string;
  totalGross: number;
  dueDate: string | null;
  status: string;
  workflowStatus: InvoiceWorkflowStatus;
  statusLabelDe: string;
  /** Anzahl offener Provisionsrechnungen (inkl. dieser). */
  openCount: number;
};

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
  /** z. B. cash_card_netting_weekly_commission */
  metadataSource: string | null;
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
  const meta = row.metadata_json && typeof row.metadata_json === "object" ? row.metadata_json : {};
  const metadataSource = typeof meta.source === "string" && meta.source.trim() ? meta.source.trim() : null;
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
    // PDF via GET …/pdf on-demand (partnerInvoicePdf); pdf_storage_key ist nur Cache.
    pdfAvailable: row.status !== "cancelled",
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
    metadataSource,
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

/**
 * Offene Provisionsnachzahlung aus dem Taxi-Wochen-Netting (Partner-Dashboard-Link).
 * Älteste offene Rechnung zuerst (Zahlungsziel / Nachverfolgung).
 */
export async function getOpenCommissionDebtForCompany(
  companyId: string,
): Promise<OpenCommissionDebtSummary | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.company_id, companyId),
        sql`coalesce(${invoicesTable.metadata_json}->>'source', '') = ${WEEKLY_COMMISSION_INVOICE_SOURCE}`,
        notInArray(invoicesTable.status, ["paid", "cancelled"]),
        ne(invoicesTable.status, "draft"),
      ),
    )
    .orderBy(asc(invoicesTable.due_date), asc(invoicesTable.created_at));
  if (rows.length === 0) return null;
  const row = rows[0]!;
  const workflowStatus = resolveInvoiceWorkflowStatus({
    status: row.status,
    due_date: row.due_date,
  });
  return {
    invoiceId: row.id,
    invoiceNumber: row.invoice_number,
    totalGross: Number(row.total_gross),
    dueDate: row.due_date ? String(row.due_date) : null,
    status: row.status,
    workflowStatus,
    statusLabelDe: workflowStatusLabelDe(workflowStatus),
    openCount: rows.length,
  };
}

/** Persistiert den Storage-Key nach on-demand-PDF-Erzeugung (Partner-Panel). */
export async function setPanelInvoicePdfStorageKey(
  companyId: string,
  invoiceId: string,
  storageKey: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  const key = storageKey.trim();
  if (!key) return;
  await db
    .update(invoicesTable)
    .set({ pdf_storage_key: key, updated_at: new Date() })
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.company_id, companyId)));
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
