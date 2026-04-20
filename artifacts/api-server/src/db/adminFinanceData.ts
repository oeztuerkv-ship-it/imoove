import { and, desc, eq, gte, ilike, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import {
  adminCompaniesTable,
  financialAuditLogTable,
  invoiceItemsTable,
  invoicesTable,
  paymentsTable,
  rideFinancialsTable,
  settlementsTable,
} from "./schema";

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

async function companyNameMap(): Promise<Map<string, string>> {
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

export async function countInvoicesAdmin(filters: { companyId?: string; status?: string; type?: string }): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const cond: SQL[] = [];
  if (filters.companyId?.trim()) cond.push(eq(invoicesTable.company_id, filters.companyId.trim()));
  if (filters.status?.trim()) cond.push(eq(invoicesTable.status, filters.status.trim()));
  if (filters.type?.trim()) cond.push(eq(invoicesTable.invoice_type, filters.type.trim()));
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(invoicesTable)
    .where(cond.length ? and(...cond) : undefined);
  return n(row?.n);
}

export async function listInvoicesAdmin(args: {
  filters: { companyId?: string; status?: string; type?: string };
  limit: number;
  offset: number;
}) {
  const db = getDb();
  if (!db) return [];
  const cond: SQL[] = [];
  if (args.filters.companyId?.trim()) cond.push(eq(invoicesTable.company_id, args.filters.companyId.trim()));
  if (args.filters.status?.trim()) cond.push(eq(invoicesTable.status, args.filters.status.trim()));
  if (args.filters.type?.trim()) cond.push(eq(invoicesTable.invoice_type, args.filters.type.trim()));
  const rows = await db
    .select()
    .from(invoicesTable)
    .where(cond.length ? and(...cond) : undefined)
    .orderBy(desc(invoicesTable.created_at))
    .limit(args.limit)
    .offset(args.offset);
  const map = await companyNameMap();
  return rows.map((r) => ({ ...r, company_name: r.company_id ? map.get(r.company_id) ?? null : null }));
}

export async function findInvoiceAdmin(invoiceId: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const map = await companyNameMap();
  const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoice_id, invoiceId));
  return {
    ...row,
    company_name: row.company_id ? map.get(row.company_id) ?? null : null,
    items,
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
