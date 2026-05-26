import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { enrichInvoiceAdminRow } from "./adminInvoiceFinanceData.js";
import type { InvoiceWorkflowFilter } from "../lib/invoiceWorkflow.js";
import { invoicesTable, paymentsTable } from "./schema";
import {
  buildInvoiceAdminWhere,
  companyCodeMap,
  companyNameMap,
  type InvoiceAdminListFilters,
} from "./adminFinanceData.js";

function n(v: unknown): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

export type InvoiceFinanceKpis = {
  openTotalGross: number;
  overdueTotalGross: number;
  paidThisMonthGross: number;
  openCount: number;
  overdueCount: number;
  currency: "EUR";
};

export async function getAdminInvoiceFinanceKpis(): Promise<InvoiceFinanceKpis> {
  if (!isPostgresConfigured()) {
    return {
      openTotalGross: 0,
      overdueTotalGross: 0,
      paidThisMonthGross: 0,
      openCount: 0,
      overdueCount: 0,
      currency: "EUR",
    };
  }
  const db = getDb();
  if (!db) {
    return {
      openTotalGross: 0,
      overdueTotalGross: 0,
      paidThisMonthGross: 0,
      openCount: 0,
      overdueCount: 0,
      currency: "EUR",
    };
  }

  const openWhere = buildInvoiceAdminWhere({ workflowFilter: "open" });
  const overdueWhere = buildInvoiceAdminWhere({ workflowFilter: "overdue" });

  const [openAgg, overdueAgg, paidMonth] = await Promise.all([
    db
      .select({
        total: sql<string>`coalesce(sum(${invoicesTable.total_gross}), 0)`,
        cnt: sql<number>`count(*)::int`,
      })
      .from(invoicesTable)
      .where(openWhere.length ? and(...openWhere) : undefined),
    db
      .select({
        total: sql<string>`coalesce(sum(${invoicesTable.total_gross}), 0)`,
        cnt: sql<number>`count(*)::int`,
      })
      .from(invoicesTable)
      .where(overdueWhere.length ? and(...overdueWhere) : undefined),
    db
      .select({
        total: sql<string>`coalesce(sum(${paymentsTable.amount}), 0)`,
      })
      .from(paymentsTable)
      .where(
        sql`${paymentsTable.target_type} = 'invoice'
          AND ${paymentsTable.status} = 'booked'
          AND ${paymentsTable.paid_at} >= date_trunc('month', CURRENT_TIMESTAMP)`,
      ),
  ]);

  return {
    openTotalGross: n(openAgg[0]?.total),
    overdueTotalGross: n(overdueAgg[0]?.total),
    paidThisMonthGross: n(paidMonth[0]?.total),
    openCount: n(openAgg[0]?.cnt),
    overdueCount: n(overdueAgg[0]?.cnt),
    currency: "EUR",
  };
}

export type InvoiceCsvRow = {
  invoice_number: string;
  company_name: string;
  company_code: string;
  company_id: string;
  subtotal_net: number;
  vat_total: number;
  total_gross: number;
  status: string;
  workflow_status: string;
  status_label_de: string;
  issue_date: string;
  due_date: string;
  paid_at: string;
  payment_reference: string;
};

function csvEscape(v: string): string {
  const s = String(v ?? "");
  if (s.includes('"') || s.includes(";") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function exportInvoicesAdminCsv(filters: InvoiceAdminListFilters): Promise<string> {
  const rows = await listInvoicesForExport({ filters, limit: 10_000 });
  const header = [
    "Rechnungsnummer",
    "Mandant",
    "Mandanten-Code",
    "Mandanten-ID",
    "Netto",
    "USt",
    "Brutto",
    "Status",
    "Workflow",
    "Status (DE)",
    "Rechnungsdatum",
    "Fällig",
    "Bezahlt am",
    "Verwendungszweck",
  ];
  const lines = [header.join(";")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.invoice_number),
        csvEscape(r.company_name),
        csvEscape(r.company_code),
        csvEscape(r.company_id),
        String(r.subtotal_net).replace(".", ","),
        String(r.vat_total).replace(".", ","),
        String(r.total_gross).replace(".", ","),
        csvEscape(r.status),
        csvEscape(r.workflow_status),
        csvEscape(r.status_label_de),
        csvEscape(r.issue_date),
        csvEscape(r.due_date),
        csvEscape(r.paid_at),
        csvEscape(r.payment_reference),
      ].join(";"),
    );
  }
  return `\uFEFF${lines.join("\n")}`;
}

async function listInvoicesForExport(args: { filters: InvoiceAdminListFilters; limit: number }) {
  const db = getDb();
  if (!db) return [] as InvoiceCsvRow[];
  const cond = buildInvoiceAdminWhere(args.filters);
  const rows = await db
    .select()
    .from(invoicesTable)
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(desc(invoicesTable.created_at))
    .limit(args.limit);
  const names = await companyNameMap();
  const codes = await companyCodeMap();
  return rows.map((r) => {
    const enriched = enrichInvoiceAdminRow(r, r.company_id ? names.get(r.company_id) ?? null : null);
    const meta =
      r.metadata_json && typeof r.metadata_json === "object"
        ? (r.metadata_json as Record<string, unknown>)
        : {};
    return {
      invoice_number: r.invoice_number,
      company_name: enriched.company_name ?? "",
      company_code: r.company_id ? codes.get(r.company_id) ?? "" : "",
      company_id: r.company_id ?? "",
      subtotal_net: Number(r.subtotal_net),
      vat_total: Number(r.vat_total),
      total_gross: Number(r.total_gross),
      status: r.status,
      workflow_status: enriched.workflow_status,
      status_label_de: enriched.status_label_de,
      issue_date: String(r.issue_date),
      due_date: r.due_date ? String(r.due_date) : "",
      paid_at: typeof meta.paid_at === "string" ? meta.paid_at.slice(0, 10) : "",
      payment_reference: enriched.payment_reference,
    };
  });
}
