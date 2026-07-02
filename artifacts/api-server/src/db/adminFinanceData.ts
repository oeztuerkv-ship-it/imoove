import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import {
  adminCompaniesTable,
  financialAuditLogTable,
  invoiceItemsTable,
  invoicesTable,
  paymentsTable,
  rideFinancialsTable,
  ridesTable,
  settlementsTable,
} from "./schema";
import { findFleetDriverInCompany } from "./fleetDriversData.js";
import { enrichInvoiceAdminRow } from "./adminInvoiceFinanceData.js";
import { parseInvoiceNumber } from "../lib/invoiceNumbering.js";
import {
  buildInvoiceTimeline,
  parseReminderHistory,
  type InvoiceTimelineEvent,
  type ReminderHistoryEntry,
} from "../lib/invoiceTimeline.js";
import type { InvoiceWorkflowFilter } from "../lib/invoiceWorkflow.js";

export type FinanceSummary = {
  totalRevenue: number;
  openReceivables: number;
  invoicesPaidCount: number;
  invoicesOpenCount: number;
  invoicesOverdueCount: number;
  openSettlementsCount: number;
  openPlatformCommission: number;
  currency: "EUR";
};

export type RideFinancialListFilters = {
  dateFrom?: Date;
  dateTo?: Date;
  payerType?: string;
  billingStatus?: string;
  settlementStatus?: string;
  payoutLineStatus?: string;
  partnerCompanyId?: string;
  serviceProviderCompanyId?: string;
  locked?: boolean;
  hasInvoice?: boolean;
  search?: string;
};

function n(v: unknown): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function escapeIlikePattern(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function companyNameMap(): Promise<Map<string, string>> {
  const db = getDb();
  if (!db) return new Map();
  const companies = await db
    .select({ id: adminCompaniesTable.id, name: adminCompaniesTable.name })
    .from(adminCompaniesTable);
  return new Map(companies.map((c) => [c.id, c.name]));
}

function buildRideFinancialWhere(filters: RideFinancialListFilters): SQL[] {
  const cond: SQL[] = [];
  if (filters.dateFrom) cond.push(gte(rideFinancialsTable.calculated_at, filters.dateFrom));
  if (filters.dateTo) cond.push(lte(rideFinancialsTable.calculated_at, filters.dateTo));
  if (filters.payerType?.trim()) cond.push(eq(rideFinancialsTable.payer_type, filters.payerType.trim()));
  if (filters.billingStatus?.trim()) cond.push(eq(rideFinancialsTable.billing_status, filters.billingStatus.trim()));
  if (filters.settlementStatus?.trim()) {
    cond.push(eq(rideFinancialsTable.settlement_status, filters.settlementStatus.trim()));
  }
  if (filters.payoutLineStatus?.trim()) {
    cond.push(eq(rideFinancialsTable.payout_line_status, filters.payoutLineStatus.trim()));
  }
  if (filters.partnerCompanyId?.trim()) {
    cond.push(eq(rideFinancialsTable.partner_company_id, filters.partnerCompanyId.trim()));
  }
  if (filters.serviceProviderCompanyId?.trim()) {
    cond.push(eq(rideFinancialsTable.service_provider_company_id, filters.serviceProviderCompanyId.trim()));
  }
  if (typeof filters.locked === "boolean") {
    cond.push(filters.locked ? isNotNull(rideFinancialsTable.locked_at) : isNull(rideFinancialsTable.locked_at));
  }
  if (typeof filters.hasInvoice === "boolean") {
    cond.push(
      filters.hasInvoice
        ? sql`exists (select 1 from invoice_items ii where ii.ride_id = ${rideFinancialsTable.ride_id})`
        : sql`not exists (select 1 from invoice_items ii where ii.ride_id = ${rideFinancialsTable.ride_id})`,
    );
  }
  if (filters.search?.trim()) {
    const raw = escapeIlikePattern(filters.search.trim());
    const p = `%${raw}%`;
    cond.push(or(ilike(rideFinancialsTable.ride_id, p), ilike(rideFinancialsTable.billing_reference, p))!);
  }
  return cond;
}

export async function getAdminFinanceSummary(args: {
  dateFrom?: Date;
  dateTo?: Date;
}): Promise<FinanceSummary> {
  if (!isPostgresConfigured()) {
    return {
      totalRevenue: 0,
      openReceivables: 0,
      invoicesPaidCount: 0,
      invoicesOpenCount: 0,
      invoicesOverdueCount: 0,
      openSettlementsCount: 0,
      openPlatformCommission: 0,
      currency: "EUR",
    };
  }
  const db = getDb();
  if (!db) {
    return {
      totalRevenue: 0,
      openReceivables: 0,
      invoicesPaidCount: 0,
      invoicesOpenCount: 0,
      invoicesOverdueCount: 0,
      openSettlementsCount: 0,
      openPlatformCommission: 0,
      currency: "EUR",
    };
  }
  const financialConds: SQL[] = [];
  if (args.dateFrom) financialConds.push(gte(rideFinancialsTable.calculated_at, args.dateFrom));
  if (args.dateTo) financialConds.push(lte(rideFinancialsTable.calculated_at, args.dateTo));
  const invoiceConds: SQL[] = [];
  if (args.dateFrom) invoiceConds.push(gte(invoicesTable.issue_date, args.dateFrom.toISOString().slice(0, 10)));
  if (args.dateTo) invoiceConds.push(lte(invoicesTable.issue_date, args.dateTo.toISOString().slice(0, 10)));
  const settlementConds: SQL[] = [];
  if (args.dateFrom) settlementConds.push(gte(settlementsTable.created_at, args.dateFrom));
  if (args.dateTo) settlementConds.push(lte(settlementsTable.created_at, args.dateTo));

  const [rf, inv, set] = await Promise.all([
    db
      .select({
        totalRevenue: sql<string>`coalesce(sum(${rideFinancialsTable.gross_amount}), 0)`,
        openReceivables: sql<string>`coalesce(sum(case when ${rideFinancialsTable.billing_status} in ('unbilled','queued','invoiced','partially_paid') then ${rideFinancialsTable.gross_amount} else 0 end), 0)`,
        openPlatformCommission: sql<string>`coalesce(sum(case when ${rideFinancialsTable.settlement_status} <> 'paid_out' then ${rideFinancialsTable.commission_amount} else 0 end), 0)`,
      })
      .from(rideFinancialsTable)
      .where(financialConds.length ? and(...financialConds) : undefined),
    db
      .select({
        paidCount: sql<number>`count(*) filter (where ${invoicesTable.status} = 'paid')::int`,
        openCount: sql<number>`count(*) filter (where ${invoicesTable.status} in ('draft','issued','partially_paid'))::int`,
        overdueCount: sql<number>`count(*) filter (where ${invoicesTable.status} = 'overdue')::int`,
      })
      .from(invoicesTable)
      .where(invoiceConds.length ? and(...invoiceConds) : undefined),
    db
      .select({
        openSettlementsCount: sql<number>`count(*) filter (where ${settlementsTable.status} in ('draft','issued','approved'))::int`,
      })
      .from(settlementsTable)
      .where(settlementConds.length ? and(...settlementConds) : undefined),
  ]);

  return {
    totalRevenue: n(rf[0]?.totalRevenue),
    openReceivables: n(rf[0]?.openReceivables),
    invoicesPaidCount: n(inv[0]?.paidCount),
    invoicesOpenCount: n(inv[0]?.openCount),
    invoicesOverdueCount: n(inv[0]?.overdueCount),
    openSettlementsCount: n(set[0]?.openSettlementsCount),
    openPlatformCommission: n(rf[0]?.openPlatformCommission),
    currency: "EUR",
  };
}

export async function countRideFinancialsAdmin(filters: RideFinancialListFilters): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const cond = buildRideFinancialWhere(filters);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rideFinancialsTable)
    .where(cond.length ? and(...cond) : undefined);
  return n(row?.n);
}

export async function listRideFinancialsAdmin(args: {
  filters: RideFinancialListFilters;
  limit: number;
  offset: number;
}) {
  const db = getDb();
  if (!db) return [];
  const cond = buildRideFinancialWhere(args.filters);
  const rows = await db
    .select()
    .from(rideFinancialsTable)
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(desc(rideFinancialsTable.calculated_at))
    .limit(args.limit)
    .offset(args.offset);
  const map = await companyNameMap();
  return rows.map((row) => ({
    ...row,
    partner_company_name: row.partner_company_id ? map.get(row.partner_company_id) ?? null : null,
    service_provider_company_name: row.service_provider_company_id
      ? map.get(row.service_provider_company_id) ?? null
      : null,
  }));
}

export type PayoutLineSort =
  | "calculated_at_desc"
  | "calculated_at_asc"
  | "company_asc"
  | "company_desc";

export type PayoutLineListFilters = {
  dateFrom?: Date;
  dateTo?: Date;
  payoutLineStatus?: string;
  companyId?: string;
  search?: string;
  sort?: PayoutLineSort;
};

/** Mandant für Auszahlung: Snapshot → Partner → Fahrt.company_id */
function resolvedPayoutCompanyIdSql() {
  return sql`coalesce(${rideFinancialsTable.service_provider_company_id}, ${rideFinancialsTable.partner_company_id}, ${ridesTable.company_id})`;
}

function payoutLinesBaseJoin() {
  return {
    ridesJoin: eq(rideFinancialsTable.ride_id, ridesTable.id),
    companyJoin: sql`${adminCompaniesTable.id} = ${resolvedPayoutCompanyIdSql()}`,
  };
}

function buildPayoutLineWhere(filters: PayoutLineListFilters): SQL[] {
  const cond: SQL[] = [];
  if (filters.dateFrom) cond.push(gte(rideFinancialsTable.calculated_at, filters.dateFrom));
  if (filters.dateTo) cond.push(lte(rideFinancialsTable.calculated_at, filters.dateTo));
  if (filters.payoutLineStatus?.trim()) {
    cond.push(eq(rideFinancialsTable.payout_line_status, filters.payoutLineStatus.trim()));
  }
  if (filters.companyId?.trim()) {
    cond.push(sql`${resolvedPayoutCompanyIdSql()} = ${filters.companyId.trim()}`);
  }
  if (filters.search?.trim()) {
    const raw = escapeIlikePattern(filters.search.trim());
    const p = `%${raw}%`;
    cond.push(
      or(
        ilike(rideFinancialsTable.ride_id, p),
        ilike(rideFinancialsTable.billing_reference, p),
        ilike(ridesTable.from_label, p),
        ilike(ridesTable.to_label, p),
        ilike(ridesTable.from_full, p),
        ilike(ridesTable.to_full, p),
        ilike(adminCompaniesTable.name, p),
      )!,
    );
  }
  return cond;
}

function payoutLineOrderBy(sort: PayoutLineSort | undefined) {
  switch (sort) {
    case "calculated_at_asc":
      return [asc(rideFinancialsTable.calculated_at)];
    case "company_asc":
      return [asc(adminCompaniesTable.name), desc(rideFinancialsTable.calculated_at)];
    case "company_desc":
      return [desc(adminCompaniesTable.name), desc(rideFinancialsTable.calculated_at)];
    case "calculated_at_desc":
    default:
      return [desc(rideFinancialsTable.calculated_at)];
  }
}

export type PayoutLineAdminRow = {
  rideId: string;
  calculatedAt: Date;
  companyId: string | null;
  companyName: string | null;
  routeLabel: string | null;
  grossAmount: number;
  stripeFeeAmount: number;
  commissionAmount: number;
  operatorPayoutAmount: number;
  payoutLineStatus: string;
};

export type PayoutLinesSummary = {
  totalRows: number;
  openCount: number;
  openNetTotal: number;
  paidOutCount: number;
};

export async function getPayoutLinesSummaryAdmin(filters: PayoutLineListFilters): Promise<PayoutLinesSummary> {
  const db = getDb();
  if (!db) {
    return { totalRows: 0, openCount: 0, openNetTotal: 0, paidOutCount: 0 };
  }
  const cond = buildPayoutLineWhere(filters);
  const { ridesJoin, companyJoin } = payoutLinesBaseJoin();
  const [row] = await db
    .select({
      totalRows: sql<number>`count(*)::int`,
      openCount: sql<number>`count(*) filter (where ${rideFinancialsTable.payout_line_status} = 'offen')::int`,
      openNetTotal: sql<string>`coalesce(sum(case when ${rideFinancialsTable.payout_line_status} = 'offen' then ${rideFinancialsTable.operator_payout_amount} else 0 end), 0)`,
      paidOutCount: sql<number>`count(*) filter (where ${rideFinancialsTable.payout_line_status} = 'ausgezahlt')::int`,
    })
    .from(rideFinancialsTable)
    .leftJoin(ridesTable, ridesJoin)
    .leftJoin(adminCompaniesTable, companyJoin)
    .where(cond.length ? and(...cond) : undefined);
  return {
    totalRows: n(row?.totalRows),
    openCount: n(row?.openCount),
    openNetTotal: n(row?.openNetTotal),
    paidOutCount: n(row?.paidOutCount),
  };
}

export async function countPayoutLinesAdmin(filters: PayoutLineListFilters): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const cond = buildPayoutLineWhere(filters);
  const { ridesJoin, companyJoin } = payoutLinesBaseJoin();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rideFinancialsTable)
    .leftJoin(ridesTable, ridesJoin)
    .leftJoin(adminCompaniesTable, companyJoin)
    .where(cond.length ? and(...cond) : undefined);
  return n(row?.n);
}

export async function listPayoutLinesAdmin(args: {
  filters: PayoutLineListFilters;
  limit: number;
  offset: number;
}): Promise<PayoutLineAdminRow[]> {
  const db = getDb();
  if (!db) return [];
  const cond = buildPayoutLineWhere(args.filters);
  const { ridesJoin, companyJoin } = payoutLinesBaseJoin();
  const rows = await db
    .select({
      rideId: rideFinancialsTable.ride_id,
      calculatedAt: rideFinancialsTable.calculated_at,
      grossAmount: rideFinancialsTable.gross_amount,
      stripeFeeAmount: rideFinancialsTable.stripe_fee_amount,
      commissionAmount: rideFinancialsTable.commission_amount,
      operatorPayoutAmount: rideFinancialsTable.operator_payout_amount,
      payoutLineStatus: rideFinancialsTable.payout_line_status,
      resolvedCompanyId: sql<string | null>`${resolvedPayoutCompanyIdSql()}`,
      companyName: adminCompaniesTable.name,
      fromLabel: ridesTable.from_label,
      toLabel: ridesTable.to_label,
    })
    .from(rideFinancialsTable)
    .leftJoin(ridesTable, ridesJoin)
    .leftJoin(adminCompaniesTable, companyJoin)
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(...payoutLineOrderBy(args.filters.sort))
    .limit(args.limit)
    .offset(args.offset);

  return rows.map((row) => {
    const from = String(row.fromLabel ?? "").trim();
    const to = String(row.toLabel ?? "").trim();
    const routeLabel = from || to ? `${from || "—"} → ${to || "—"}` : null;
    return {
      rideId: row.rideId,
      calculatedAt: row.calculatedAt,
      companyId: row.resolvedCompanyId ?? null,
      companyName: row.companyName ?? null,
      routeLabel,
      grossAmount: n(row.grossAmount),
      stripeFeeAmount: n(row.stripeFeeAmount),
      commissionAmount: n(row.commissionAmount),
      operatorPayoutAmount: n(row.operatorPayoutAmount),
      payoutLineStatus: String(row.payoutLineStatus ?? "offen"),
    };
  });
}

export async function getRideFinancialDetailAdmin(rideId: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(rideFinancialsTable)
    .where(eq(rideFinancialsTable.ride_id, rideId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const map = await companyNameMap();

  const [invoiceLinks, auditEntries] = await Promise.all([
    db
      .select({
        invoiceId: invoicesTable.id,
        invoiceNumber: invoicesTable.invoice_number,
        invoiceType: invoicesTable.invoice_type,
        status: invoicesTable.status,
        issueDate: invoicesTable.issue_date,
      })
      .from(invoiceItemsTable)
      .innerJoin(invoicesTable, eq(invoiceItemsTable.invoice_id, invoicesTable.id))
      .where(eq(invoiceItemsTable.ride_id, rideId)),
    db
      .select()
      .from(financialAuditLogTable)
      .where(and(eq(financialAuditLogTable.entity_type, "ride_financial"), eq(financialAuditLogTable.entity_id, row.id)))
      .orderBy(desc(financialAuditLogTable.created_at))
      .limit(100),
  ]);

  const settlementLinks = await db
    .select({
      id: settlementsTable.id,
      settlementNumber: settlementsTable.settlement_number,
      status: settlementsTable.status,
      periodStart: settlementsTable.period_start,
      periodEnd: settlementsTable.period_end,
      companyId: settlementsTable.company_id,
    })
    .from(settlementsTable)
    .where(sql`${settlementsTable.metadata_json}->>'ride_id' = ${rideId}`)
    .limit(20);

  return {
    ...row,
    partner_company_name: row.partner_company_id ? map.get(row.partner_company_id) ?? null : null,
    service_provider_company_name: row.service_provider_company_id
      ? map.get(row.service_provider_company_id) ?? null
      : null,
    invoice_links: invoiceLinks,
    settlement_links: settlementLinks.map((x) => ({
      ...x,
      companyName: map.get(x.companyId) ?? null,
    })),
    audit_entries: auditEntries,
  };
}

export type InvoiceAdminListFilters = {
  companyId?: string;
  status?: string;
  workflowFilter?: InvoiceWorkflowFilter;
  type?: string;
  companyCode?: string;
  invoicePrefix?: string;
  /** Bankmatching / Suche: Rechnungsnummer oder Verwendungszweck (Teilstring). */
  invoiceNumber?: string;
};

function appendInvoiceWorkflowFilter(cond: SQL[], filter: InvoiceWorkflowFilter | undefined): void {
  if (!filter || filter === "all") return;
  const today = sql`CURRENT_DATE`;
  switch (filter) {
    case "paid":
      cond.push(eq(invoicesTable.status, "paid"));
      return;
    case "cancelled":
      cond.push(eq(invoicesTable.status, "cancelled"));
      return;
    case "reminder_sent":
      cond.push(eq(invoicesTable.status, "reminder_sent"));
      return;
    case "due":
      cond.push(
        sql`${invoicesTable.status} in ('issued', 'partially_paid', 'reminder_sent') and ${invoicesTable.due_date} = ${today}`,
      );
      return;
    case "overdue":
      cond.push(
        sql`(
          ${invoicesTable.status} = 'overdue'
          OR (
            ${invoicesTable.status} in ('issued', 'partially_paid')
            AND ${invoicesTable.due_date} is not null
            AND ${invoicesTable.due_date} < ${today}
          )
        ) AND ${invoicesTable.status} <> 'reminder_sent'`,
      );
      return;
    case "open":
      cond.push(
        sql`${invoicesTable.status} in ('issued', 'partially_paid') AND (
          ${invoicesTable.due_date} is null OR ${invoicesTable.due_date} > ${today}
        )`,
      );
      return;
    default:
      return;
  }
}

export function buildInvoiceAdminWhere(filters: InvoiceAdminListFilters): SQL[] {
  const cond: SQL[] = [];
  if (filters.companyId?.trim()) cond.push(eq(invoicesTable.company_id, filters.companyId.trim()));
  if (filters.workflowFilter) {
    appendInvoiceWorkflowFilter(cond, filters.workflowFilter);
  } else if (filters.status?.trim()) {
    cond.push(eq(invoicesTable.status, filters.status.trim()));
  }
  if (filters.type?.trim()) cond.push(eq(invoicesTable.invoice_type, filters.type.trim()));
  if (filters.companyCode?.trim()) {
    cond.push(sql`exists (
      select 1 from admin_companies ac
      where ac.id = ${invoicesTable.company_id}
        and upper(ac.company_code) = upper(${filters.companyCode!.trim()})
    )`);
  }
  if (filters.invoicePrefix?.trim()) {
    const p = filters.invoicePrefix.trim().toUpperCase();
    cond.push(sql`${invoicesTable.invoice_number} like ${`ONR-${p}-%`}`);
  }
  if (filters.invoiceNumber?.trim()) {
    const q = `%${filters.invoiceNumber.trim().replace(/%/g, "\\%")}%`;
    cond.push(sql`${invoicesTable.invoice_number} ilike ${q}`);
  }
  return cond;
}

export async function countInvoicesAdmin(filters: InvoiceAdminListFilters): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const cond = buildInvoiceAdminWhere(filters);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(invoicesTable)
    .where(cond.length ? and(...cond) : undefined);
  return n(row?.n);
}

export async function listInvoicesAdmin(args: {
  filters: InvoiceAdminListFilters;
  limit: number;
  offset: number;
}) {
  const db = getDb();
  if (!db) return [];
  const cond = buildInvoiceAdminWhere(args.filters);
  const rows = await db
    .select()
    .from(invoicesTable)
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(desc(invoicesTable.created_at))
    .limit(args.limit)
    .offset(args.offset);
  const map = await companyNameMap();
  const codeMap = await companyCodeMap();
  return rows.map((r) => {
    const enriched = enrichInvoiceAdminRow(r, r.company_id ? map.get(r.company_id) ?? null : null);
    return {
      ...enriched,
      company_code: r.company_id ? codeMap.get(r.company_id) ?? "" : "",
    };
  });
}

export async function companyCodeMap(): Promise<Map<string, string>> {
  const db = getDb();
  if (!db) return new Map();
  const companies = await db
    .select({ id: adminCompaniesTable.id, company_code: adminCompaniesTable.company_code })
    .from(adminCompaniesTable);
  return new Map(companies.map((c) => [c.id, c.company_code ?? ""]));
}

export async function findInvoiceByInvoiceNumber(invoiceNumber: string) {
  const db = getDb();
  if (!db) return null;
  const num = invoiceNumber.trim();
  if (!num) return null;
  const rows = await db.select().from(invoicesTable).where(eq(invoicesTable.invoice_number, num)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return findInvoiceAdmin(row.id);
}

/** Teile für Bankmatching (Prefix, Monat, SEQ) — null bei unbekanntem Format. */
export function parseInvoiceNumberForLookup(invoiceNumber: string) {
  return parseInvoiceNumber(invoiceNumber);
}

/** Bankmatching: Verwendungszweck = Rechnungsnummer (inkl. Legacy-Auflösung). */
export async function findInvoiceByPaymentReference(reference: string) {
  const { lookupPaymentReferenceForBankMatching } = await import("../lib/invoicePaymentReference.js");
  const parsed = lookupPaymentReferenceForBankMatching(reference);
  if (parsed) return findInvoiceByInvoiceNumber(parsed.invoiceNumber);
  const trimmed = reference.trim();
  if (!trimmed) return null;
  return findInvoiceByInvoiceNumber(trimmed);
}

export async function findInvoiceAdmin(invoiceId: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const map = await companyNameMap();
  const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoice_id, invoiceId));
  const companyName = row.company_id ? map.get(row.company_id) ?? null : null;
  const codes = await companyCodeMap();
  const linkedPayments = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.target_type, "invoice"), eq(paymentsTable.target_id, invoiceId)))
    .orderBy(desc(paymentsTable.created_at));
  const audit_entries = await db
    .select()
    .from(financialAuditLogTable)
    .where(and(eq(financialAuditLogTable.entity_type, "invoice"), eq(financialAuditLogTable.entity_id, invoiceId)))
    .orderBy(desc(financialAuditLogTable.created_at))
    .limit(80);
  const meta =
    row.metadata_json && typeof row.metadata_json === "object"
      ? (row.metadata_json as Record<string, unknown>)
      : {};
  const reminder_history: ReminderHistoryEntry[] = parseReminderHistory(meta);
  const timeline: InvoiceTimelineEvent[] = buildInvoiceTimeline({
    invoiceId: row.id,
    invoiceNumber: row.invoice_number,
    createdAt: row.created_at,
    issueDate: String(row.issue_date),
    auditEntries: audit_entries.map((a) => ({
      id: a.id,
      action: a.action,
      created_at: a.created_at,
      actor_id: a.actor_id,
      new_value_json:
        a.new_value_json && typeof a.new_value_json === "object"
          ? (a.new_value_json as Record<string, unknown>)
          : {},
    })),
    payments: linkedPayments.map((p) => ({
      id: p.id,
      status: p.status,
      amount: Number(p.amount),
      paid_at: p.paid_at,
      reference: p.reference,
      created_at: p.created_at,
      metadata_json:
        p.metadata_json && typeof p.metadata_json === "object"
          ? (p.metadata_json as Record<string, unknown>)
          : {},
    })),
    reminderHistory: reminder_history,
  });
  return {
    ...enrichInvoiceAdminRow(row, companyName),
    company_code: row.company_id ? codes.get(row.company_id) ?? "" : "",
    items,
    payments: linkedPayments,
    payment_history: linkedPayments,
    audit_entries,
    timeline,
    reminder_history,
    paid_at: typeof meta.paid_at === "string" ? meta.paid_at : null,
    paid_by_admin: typeof meta.paid_by_admin === "string" ? meta.paid_by_admin : null,
    reminder_sent_at: typeof meta.reminder_sent_at === "string" ? meta.reminder_sent_at : null,
    reminder_mail_sent_at:
      typeof meta.reminder_mail_sent_at === "string" ? meta.reminder_mail_sent_at : null,
    reminder_mail_to: typeof meta.reminder_mail_to === "string" ? meta.reminder_mail_to : null,
    reminder_mail_status:
      typeof meta.reminder_mail_status === "string" ? meta.reminder_mail_status : null,
    payment_reverted_at: typeof meta.payment_reverted_at === "string" ? meta.payment_reverted_at : null,
    payment_reverted_by_admin:
      typeof meta.payment_reverted_by_admin === "string" ? meta.payment_reverted_by_admin : null,
    payment_revert_reason: typeof meta.payment_revert_reason === "string" ? meta.payment_revert_reason : null,
  };
}

export async function countSettlementsAdmin(filters: { companyId?: string; status?: string }): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const cond: SQL[] = [];
  if (filters.companyId?.trim()) cond.push(eq(settlementsTable.company_id, filters.companyId.trim()));
  if (filters.status?.trim()) cond.push(eq(settlementsTable.status, filters.status.trim()));
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(settlementsTable)
    .where(cond.length ? and(...cond) : undefined);
  return n(row?.n);
}

export async function listSettlementsAdmin(args: {
  filters: { companyId?: string; status?: string };
  limit: number;
  offset: number;
}) {
  const db = getDb();
  if (!db) return [];
  const cond: SQL[] = [];
  if (args.filters.companyId?.trim()) cond.push(eq(settlementsTable.company_id, args.filters.companyId.trim()));
  if (args.filters.status?.trim()) cond.push(eq(settlementsTable.status, args.filters.status.trim()));
  const rows = await db
    .select()
    .from(settlementsTable)
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(desc(settlementsTable.created_at))
    .limit(args.limit)
    .offset(args.offset);
  const map = await companyNameMap();
  return rows.map((r) => ({ ...r, company_name: map.get(r.company_id) ?? null }));
}

export async function findSettlementAdmin(settlementId: string) {
  const db = getDb();
  if (!db) return null;
  const [row] = await db.select().from(settlementsTable).where(eq(settlementsTable.id, settlementId)).limit(1);
  if (!row) return null;
  const map = await companyNameMap();
  const linkedPayments = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.target_type, "settlement"), eq(paymentsTable.target_id, settlementId)))
    .orderBy(desc(paymentsTable.created_at));
  return {
    ...row,
    company_name: map.get(row.company_id) ?? null,
    payments: linkedPayments,
  };
}

export async function countPaymentsAdmin(filters: {
  targetType?: string;
  status?: string;
  companyId?: string;
}): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const cond: SQL[] = [];
  if (filters.targetType?.trim()) cond.push(eq(paymentsTable.target_type, filters.targetType.trim()));
  if (filters.status?.trim()) cond.push(eq(paymentsTable.status, filters.status.trim()));
  if (filters.companyId?.trim()) cond.push(eq(paymentsTable.company_id, filters.companyId.trim()));
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(paymentsTable)
    .where(cond.length ? and(...cond) : undefined);
  return n(row?.n);
}

export async function listPaymentsAdmin(args: {
  filters: { targetType?: string; status?: string; companyId?: string };
  limit: number;
  offset: number;
}) {
  const db = getDb();
  if (!db) return [];
  const cond: SQL[] = [];
  if (args.filters.targetType?.trim()) cond.push(eq(paymentsTable.target_type, args.filters.targetType.trim()));
  if (args.filters.status?.trim()) cond.push(eq(paymentsTable.status, args.filters.status.trim()));
  if (args.filters.companyId?.trim()) cond.push(eq(paymentsTable.company_id, args.filters.companyId.trim()));
  const rows = await db
    .select()
    .from(paymentsTable)
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(desc(paymentsTable.created_at))
    .limit(args.limit)
    .offset(args.offset);
  const map = await companyNameMap();
  return rows.map((r) => ({ ...r, company_name: r.company_id ? map.get(r.company_id) ?? null : null }));
}

export async function countFinancialAuditAdmin(filters: {
  entityType?: string;
  action?: string;
  entityId?: string;
}): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const cond: SQL[] = [];
  if (filters.entityType?.trim()) cond.push(eq(financialAuditLogTable.entity_type, filters.entityType.trim()));
  if (filters.action?.trim()) cond.push(eq(financialAuditLogTable.action, filters.action.trim()));
  if (filters.entityId?.trim()) cond.push(eq(financialAuditLogTable.entity_id, filters.entityId.trim()));
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(financialAuditLogTable)
    .where(cond.length ? and(...cond) : undefined);
  return n(row?.n);
}

export async function listFinancialAuditAdmin(args: {
  filters: { entityType?: string; action?: string; entityId?: string };
  limit: number;
  offset: number;
}) {
  const db = getDb();
  if (!db) return [];
  const cond: SQL[] = [];
  if (args.filters.entityType?.trim()) cond.push(eq(financialAuditLogTable.entity_type, args.filters.entityType.trim()));
  if (args.filters.action?.trim()) cond.push(eq(financialAuditLogTable.action, args.filters.action.trim()));
  if (args.filters.entityId?.trim()) cond.push(eq(financialAuditLogTable.entity_id, args.filters.entityId.trim()));
  return db
    .select()
    .from(financialAuditLogTable)
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(desc(financialAuditLogTable.created_at))
    .limit(args.limit)
    .offset(args.offset);
}

export async function getFinanceEligibilitySummaryForRide(rideId: string): Promise<{
  invoiceEligible: boolean;
  invoiceBlockers: string[];
  settlementEligible: boolean;
  settlementBlockers: string[];
}> {
  const db = getDb();
  if (!db) {
    return {
      invoiceEligible: false,
      invoiceBlockers: ["database_not_configured"],
      settlementEligible: false,
      settlementBlockers: ["database_not_configured"],
    };
  }
  const [{ findRide }] = await Promise.all([import("./ridesData")]);
  const ride = await findRide(rideId);
  const rf = await getRideFinancialDetailAdmin(rideId);
  if (!ride || !rf) {
    return {
      invoiceEligible: false,
      invoiceBlockers: ["missing_snapshot_or_ride"],
      settlementEligible: false,
      settlementBlockers: ["missing_snapshot_or_ride"],
    };
  }
  const [{ getInvoiceEligibility, getSettlementEligibility }] = await Promise.all([
    import("./rideFinancialsData"),
  ]);
  const invoice = getInvoiceEligibility({
    ride,
    snapshot: {
      payerType: rf.payer_type,
      billingMode: rf.billing_mode,
      billingReference: rf.billing_reference,
      billingStatus: rf.billing_status,
    },
  });
  const settlement = getSettlementEligibility({
    ride,
    snapshot: {
      serviceProviderCompanyId: rf.service_provider_company_id,
      settlementStatus: rf.settlement_status,
    },
  });
  return {
    invoiceEligible: invoice.eligible,
    invoiceBlockers: invoice.blockers,
    settlementEligible: settlement.eligible,
    settlementBlockers: settlement.blockers,
  };
}

export type AdminDailyDriverSettlementRow = {
  driverId: string;
  companyId: string;
  driverName: string;
  companyName: string;
  rideCount: number;
  grossAmount: number;
  commissionAmount: number;
  tipAmount: number;
  driverPayoutAmount: number;
};

export type AdminDailyDriverSettlementReport = {
  date: string;
  totals: {
    rideCount: number;
    grossAmount: number;
    commissionAmount: number;
    tipAmount: number;
    driverPayoutAmount: number;
  };
  drivers: AdminDailyDriverSettlementRow[];
};

export async function getAdminDailyDriverSettlement(args: {
  dateFrom: Date;
  dateTo: Date;
  dateLabel: string;
}): Promise<AdminDailyDriverSettlementReport> {
  const empty: AdminDailyDriverSettlementReport = {
    date: args.dateLabel,
    totals: { rideCount: 0, grossAmount: 0, commissionAmount: 0, tipAmount: 0, driverPayoutAmount: 0 },
    drivers: [],
  };
  if (!isPostgresConfigured()) return empty;
  const db = getDb();
  if (!db) return empty;

  const rows = await db
    .select({
      driverId: ridesTable.driver_id,
      companyId: ridesTable.company_id,
      rideCount: sql<number>`count(*)::int`,
      grossAmount: sql<number>`coalesce(sum(${rideFinancialsTable.gross_amount}), 0)`,
      commissionAmount: sql<number>`coalesce(sum(${rideFinancialsTable.commission_amount}), 0)`,
      tipAmount: sql<number>`coalesce(sum(${rideFinancialsTable.tip_amount}), 0)`,
      driverPayoutAmount: sql<number>`coalesce(sum(${rideFinancialsTable.operator_payout_amount}), 0)`,
    })
    .from(rideFinancialsTable)
    .innerJoin(ridesTable, eq(ridesTable.id, rideFinancialsTable.ride_id))
    .where(
      and(
        eq(ridesTable.status, "completed"),
        gte(rideFinancialsTable.calculated_at, args.dateFrom),
        lte(rideFinancialsTable.calculated_at, args.dateTo),
        isNotNull(ridesTable.driver_id),
      ),
    )
    .groupBy(ridesTable.driver_id, ridesTable.company_id)
    .orderBy(sql`coalesce(sum(${rideFinancialsTable.gross_amount}), 0) desc`);

  const companyNames = await companyNameMap();
  const drivers: AdminDailyDriverSettlementRow[] = [];

  for (const row of rows) {
    const driverId = String(row.driverId ?? "").trim();
    const companyId = String(row.companyId ?? "").trim();
    if (!driverId || !companyId) continue;

    const driverRow = await findFleetDriverInCompany(driverId, companyId);
    const firstName = String(driverRow?.first_name ?? "").trim();
    const lastName = String(driverRow?.last_name ?? "").trim();
    const driverName = `${firstName} ${lastName}`.trim() || driverId;

    drivers.push({
      driverId,
      companyId,
      driverName,
      companyName: companyNames.get(companyId) ?? companyId,
      rideCount: Number(row.rideCount) || 0,
      grossAmount: n(row.grossAmount),
      commissionAmount: n(row.commissionAmount),
      tipAmount: n(row.tipAmount),
      driverPayoutAmount: n(row.driverPayoutAmount),
    });
  }

  const totals = drivers.reduce(
    (acc, d) => ({
      rideCount: acc.rideCount + d.rideCount,
      grossAmount: acc.grossAmount + d.grossAmount,
      commissionAmount: acc.commissionAmount + d.commissionAmount,
      tipAmount: acc.tipAmount + d.tipAmount,
      driverPayoutAmount: acc.driverPayoutAmount + d.driverPayoutAmount,
    }),
    { rideCount: 0, grossAmount: 0, commissionAmount: 0, tipAmount: 0, driverPayoutAmount: 0 },
  );

  return { date: args.dateLabel, totals, drivers };
}
