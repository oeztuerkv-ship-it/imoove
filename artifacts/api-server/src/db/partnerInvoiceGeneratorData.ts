import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "./client";
import { allocatePartnerInvoiceNumberInTx } from "./invoiceNumberSequencesData.js";
import { buildInvoicePaymentReference } from "../lib/invoicePaymentReference.js";
import { getPanelCompanyById } from "./panelCompanyData";
import { adminCompaniesTable, invoiceItemsTable, invoicesTable } from "./schema";

export type PartnerInvoiceGeneratorItem = {
  rideId?: string | null;
  itemType: string;
  description: string;
  quantity?: number;
  unitNet?: number;
  vatRate?: number;
  lineNet?: number;
  lineVat?: number;
  lineGross: number;
  metadata?: Record<string, unknown>;
};

export type CreatePartnerMonthlyInvoiceInput = {
  companyId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  issueDate: string;
  dueDate?: string | null;
  items: PartnerInvoiceGeneratorItem[];
  notes?: string | null;
  status?: "draft" | "issued";
  actorLabel: string;
  /** Bei true: zweite Rechnung für gleichen Mandanten+Zeitraum erlauben (Standard: false). */
  allowDuplicatePeriod?: boolean;
  /** Zusätzliche Metadaten (z. B. Monatslauf-Kennzeichnung). */
  metadataExtra?: Record<string, unknown>;
};

type ExecDb = NonNullable<ReturnType<typeof getDb>>;

export type CreatePartnerMonthlyInvoiceTxResult =
  | {
      ok: true;
      invoiceId: string;
      invoiceNumber: string;
      paymentReference: string;
      subtotalNet: number;
      vatTotal: number;
      totalGross: number;
    }
  | { ok: false; error: string; existingInvoiceId?: string };

/** Rechnung + Positionen in bestehender Transaktion (Monatslauf, manuelles Generate). */
export async function createPartnerMonthlyInvoiceInTx(
  tx: ExecDb,
  input: CreatePartnerMonthlyInvoiceInput,
): Promise<CreatePartnerMonthlyInvoiceTxResult> {
  const companyId = input.companyId.trim();
  if (!companyId) return { ok: false, error: "company_id_required" };
  if (!input.items.length) return { ok: false, error: "items_required" };

  if (!input.allowDuplicatePeriod) {
    const dup = await tx
      .select({ id: invoicesTable.id, invoice_number: invoicesTable.invoice_number })
      .from(invoicesTable)
      .where(
        and(
          eq(invoicesTable.company_id, companyId),
          eq(invoicesTable.billing_period_start, input.billingPeriodStart),
          eq(invoicesTable.billing_period_end, input.billingPeriodEnd),
          ne(invoicesTable.status, "cancelled"),
        ),
      )
      .limit(1);
    if (dup[0]) {
      return {
        ok: false,
        error: "invoice_period_already_exists",
        existingInvoiceId: dup[0].id,
      };
    }
  }

  const allocated = await allocatePartnerInvoiceNumberInTx(tx, {
    companyId,
    billingPeriodEnd: input.billingPeriodEnd,
  });

  const paymentReference = buildInvoicePaymentReference({ invoiceNumber: allocated.invoiceNumber });

  const subtotalNet = input.items.reduce((s, i) => s + Number(i.lineNet ?? i.lineGross), 0);
  const vatTotal = input.items.reduce((s, i) => s + Number(i.lineVat ?? 0), 0);
  const totalGross = input.items.reduce((s, i) => s + Number(i.lineGross), 0);

  const invoiceId = `inv-${randomUUID()}`;
  const status = input.status ?? "issued";
  const meta: Record<string, unknown> = {
    ...(input.metadataExtra ?? {}),
  };
  if (input.notes?.trim()) meta.notes = input.notes.trim();
  meta.invoice_prefix = allocated.invoicePrefix;
  meta.period_ym = allocated.periodYm;
  meta.sequence = allocated.sequence;
  meta.created_by = input.actorLabel;

  await tx.insert(invoicesTable).values({
    id: invoiceId,
    invoice_number: allocated.invoiceNumber,
    company_id: companyId,
    invoice_type: "partner_invoice",
    billing_period_start: input.billingPeriodStart,
    billing_period_end: input.billingPeriodEnd,
    subtotal_net: subtotalNet,
    vat_total: vatTotal,
    total_gross: totalGross,
    issue_date: input.issueDate,
    due_date: input.dueDate ?? null,
    status,
    payment_reference: paymentReference,
    pdf_storage_key: "",
    metadata_json: meta,
  });

  for (const item of input.items) {
    await tx.insert(invoiceItemsTable).values({
      id: `ii-${randomUUID()}`,
      invoice_id: invoiceId,
      ride_id: item.rideId ?? null,
      item_type: item.itemType,
      description: item.description,
      quantity: item.quantity ?? 1,
      unit_net: item.unitNet ?? item.lineGross,
      vat_rate: item.vatRate ?? 0,
      line_net: item.lineNet ?? item.lineGross,
      line_vat: item.lineVat ?? 0,
      line_gross: item.lineGross,
      metadata_json: item.metadata ?? {},
    });
  }

  return {
    ok: true,
    invoiceId,
    invoiceNumber: allocated.invoiceNumber,
    paymentReference,
    subtotalNet,
    vatTotal,
    totalGross,
  };
}

export async function createPartnerMonthlyInvoice(
  input: CreatePartnerMonthlyInvoiceInput,
): Promise<
  | { ok: true; invoiceId: string; invoiceNumber: string; paymentReference: string; idempotent?: boolean }
  | { ok: false; error: string; existingInvoiceId?: string }
> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const companyId = input.companyId.trim();
  if (!companyId) return { ok: false, error: "company_id_required" };

  const company = await getPanelCompanyById(companyId);
  if (!company) return { ok: false, error: "company_not_found" };

  try {
    return await db.transaction(async (tx) => {
      const out = await createPartnerMonthlyInvoiceInTx(tx, input);
      if (!out.ok) return out;
      return {
        ok: true as const,
        invoiceId: out.invoiceId,
        invoiceNumber: out.invoiceNumber,
        paymentReference: out.paymentReference,
      };
    });
  } catch (e: unknown) {
    const err = e as Error & { code?: string };
    if (err.code === "company_code_required") return { ok: false, error: "company_code_required" };
    if (err.code === "company_not_found") return { ok: false, error: "company_not_found" };
    if (err.message === "invoice_sequence_overflow") return { ok: false, error: "invoice_sequence_overflow" };
    const msg = String(err.message ?? "");
    if (msg.includes("invoices_invoice_number") || msg.includes("duplicate key")) {
      return { ok: false, error: "invoice_number_conflict" };
    }
    throw e;
  }
}

/** Setzt invoice_prefix aus company_kind, wenn leer (Admin-Onboarding). */
export async function ensureCompanyInvoicePrefixFromKind(companyId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const { defaultInvoicePrefixForCompanyKind } = await import("../lib/invoiceNumbering.js");
  const rows = await db
    .select({
      company_kind: adminCompaniesTable.company_kind,
      invoice_prefix: adminCompaniesTable.invoice_prefix,
    })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.id, companyId))
    .limit(1);
  const row = rows[0];
  if (!row) return;
  const current = String(row.invoice_prefix ?? "").trim();
  if (current) return;
  const prefix = defaultInvoicePrefixForCompanyKind(row.company_kind);
  await db
    .update(adminCompaniesTable)
    .set({ invoice_prefix: prefix })
    .where(eq(adminCompaniesTable.id, companyId));
}
