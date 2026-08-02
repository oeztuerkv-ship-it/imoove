import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import {
  MONTHLY_INVOICE_RUN_COMPANY_KINDS,
  addCalendarDays,
  validateMonthlyRunPeriod,
} from "../lib/monthlyInvoiceRun.js";
import { getDb } from "./client";
import {
  createPartnerMonthlyInvoiceInTx,
  ensureCompanyInvoicePrefixFromKind,
  type PartnerInvoiceGeneratorItem,
} from "./partnerInvoiceGeneratorData.js";
import {
  adminCompaniesTable,
  financialAuditLogTable,
  invoiceItemsTable,
  invoicesTable,
  rideFinancialsTable,
  ridesTable,
} from "./schema";

type ExecDb = NonNullable<ReturnType<typeof getDb>>;

const BILLABLE_BILLING_STATUSES = ["unbilled", "queued"] as const;
const INVOICE_DUE_DAYS = 14;

export type MonthlyInvoiceRunOutcome = "created" | "skipped" | "no_rides" | "error";

export type MonthlyInvoiceRunCompanyResult = {
  companyId: string;
  companyName: string;
  companyKind: string;
  companyCode: string | null;
  outcome: MonthlyInvoiceRunOutcome;
  rideCount?: number;
  subtotalNet?: number;
  vatTotal?: number;
  totalGross?: number;
  invoiceId?: string;
  invoiceNumber?: string;
  paymentReference?: string;
  existingInvoiceId?: string;
  error?: string;
};

/** API-Zeile im Ergebnisreport (snake_case, verbindlich für Admin-UI). */
export type MonthlyInvoiceRunReportRow = {
  company_id: string;
  company_code: string | null;
  company_name: string;
  company_kind: string;
  status: MonthlyInvoiceRunOutcome;
  invoice_id: string | null;
  invoice_number: string | null;
  subtotal_net: number | null;
  vat_total: number | null;
  total_gross: number | null;
  ride_count: number | null;
  error: string | null;
};

function formatMonthlyRunReportRow(row: MonthlyInvoiceRunCompanyResult): MonthlyInvoiceRunReportRow {
  return {
    company_id: row.companyId,
    company_code: row.companyCode,
    company_name: row.companyName,
    company_kind: row.companyKind,
    status: row.outcome,
    invoice_id: row.invoiceId ?? row.existingInvoiceId ?? null,
    invoice_number: row.invoiceNumber ?? null,
    subtotal_net: row.subtotalNet ?? null,
    vat_total: row.vatTotal ?? null,
    total_gross: row.totalGross ?? null,
    ride_count: row.rideCount ?? null,
    error: row.error ?? null,
  };
}

function sumItemTotals(items: PartnerInvoiceGeneratorItem[]): {
  subtotalNet: number;
  vatTotal: number;
  totalGross: number;
} {
  const subtotalNet = items.reduce((s, i) => s + Number(i.lineNet ?? i.lineGross), 0);
  const vatTotal = items.reduce((s, i) => s + Number(i.lineVat ?? 0), 0);
  const totalGross = items.reduce((s, i) => s + Number(i.lineGross), 0);
  return { subtotalNet, vatTotal, totalGross };
}

export type MonthlyInvoiceRunSummary = {
  companiesScanned: number;
  createdCount: number;
  skippedCount: number;
  noRidesCount: number;
  errorCount: number;
  totalGrossCreated: number;
};

export type MonthlyInvoiceRunResult = {
  ok: true;
  dryRun: boolean;
  periodStart: string;
  periodEnd: string;
  summary: MonthlyInvoiceRunSummary;
  results: MonthlyInvoiceRunReportRow[];
};

type EligibleRideRow = {
  financialId: string;
  rideId: string;
  grossAmount: number;
  netAmount: number;
  vatAmount: number;
  vatRate: number;
  fromLabel: string;
  toLabel: string;
};

async function insertFinancialAuditInTx(
  tx: ExecDb,
  input: {
    entityType: string;
    entityId: string;
    action: string;
    newValue: Record<string, unknown>;
    oldValue?: Record<string, unknown>;
    actorType: string;
    actorId?: string | null;
  },
): Promise<void> {
  await tx.insert(financialAuditLogTable).values({
    id: `fal-${randomUUID()}`,
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    old_value_json: input.oldValue ?? {},
    new_value_json: input.newValue,
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
  });
}

async function findExistingInvoiceForPeriod(
  tx: ExecDb,
  companyId: string,
  periodStart: string,
  periodEnd: string,
): Promise<{
  id: string;
  invoice_number: string;
  subtotal_net: number;
  vat_total: number;
  total_gross: number;
} | null> {
  const rows = await tx
    .select({
      id: invoicesTable.id,
      invoice_number: invoicesTable.invoice_number,
      subtotal_net: invoicesTable.subtotal_net,
      vat_total: invoicesTable.vat_total,
      total_gross: invoicesTable.total_gross,
    })
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.company_id, companyId),
        eq(invoicesTable.billing_period_start, periodStart),
        eq(invoicesTable.billing_period_end, periodEnd),
        ne(invoicesTable.status, "cancelled"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function listEligibleRidesForCompany(
  db: ExecDb,
  companyId: string,
  periodStart: string,
  periodEnd: string,
): Promise<EligibleRideRow[]> {
  const rows = await db
    .select({
      financialId: rideFinancialsTable.id,
      rideId: rideFinancialsTable.ride_id,
      grossAmount: rideFinancialsTable.gross_amount,
      netAmount: rideFinancialsTable.net_amount,
      vatAmount: rideFinancialsTable.vat_amount,
      vatRate: rideFinancialsTable.vat_rate,
      fromLabel: ridesTable.from_label,
      toLabel: ridesTable.to_label,
    })
    .from(rideFinancialsTable)
    .innerJoin(ridesTable, eq(rideFinancialsTable.ride_id, ridesTable.id))
    .where(
      and(
        eq(rideFinancialsTable.partner_company_id, companyId),
        inArray(rideFinancialsTable.billing_status, [...BILLABLE_BILLING_STATUSES]),
        eq(ridesTable.status, "completed"),
        sql`${rideFinancialsTable.calculated_at}::date >= ${periodStart}::date`,
        sql`${rideFinancialsTable.calculated_at}::date <= ${periodEnd}::date`,
        sql`not exists (
          select 1 from invoice_items ii
          where ii.ride_id = ${rideFinancialsTable.ride_id}
        )`,
      ),
    )
    .orderBy(rideFinancialsTable.calculated_at);

  return rows.map((r) => ({
    financialId: r.financialId,
    rideId: r.rideId,
    grossAmount: Number(r.grossAmount) || 0,
    netAmount: Number(r.netAmount) || 0,
    vatAmount: Number(r.vatAmount) || 0,
    vatRate: Number(r.vatRate) || 0,
    fromLabel: String(r.fromLabel ?? "").trim(),
    toLabel: String(r.toLabel ?? "").trim(),
  }));
}

function buildInvoiceItemsFromRides(rides: EligibleRideRow[]): PartnerInvoiceGeneratorItem[] {
  return rides.map((r) => {
    const route =
      r.fromLabel && r.toLabel ? `${r.fromLabel} → ${r.toLabel}` : r.fromLabel || r.toLabel || "";
    const description = route ? `Fahrt ${r.rideId}: ${route}` : `Fahrt ${r.rideId}`;
    const lineGross = r.grossAmount > 0 ? r.grossAmount : r.netAmount + r.vatAmount;
    const lineNet = r.netAmount > 0 ? r.netAmount : lineGross - r.vatAmount;
    const lineVat = r.vatAmount > 0 ? r.vatAmount : Math.max(0, lineGross - lineNet);
    return {
      rideId: r.rideId,
      itemType: "ride",
      description,
      quantity: 1,
      unitNet: lineNet,
      vatRate: r.vatRate,
      lineNet,
      lineVat,
      lineGross,
      metadata: { ride_financial_id: r.financialId },
    };
  });
}

async function listBillableCompanies(db: ExecDb) {
  return db
    .select({
      id: adminCompaniesTable.id,
      name: adminCompaniesTable.name,
      company_kind: adminCompaniesTable.company_kind,
      company_code: adminCompaniesTable.company_code,
      is_active: adminCompaniesTable.is_active,
    })
    .from(adminCompaniesTable)
    .where(
      and(
        eq(adminCompaniesTable.is_active, true),
        inArray(adminCompaniesTable.company_kind, [...MONTHLY_INVOICE_RUN_COMPANY_KINDS]),
      ),
    )
    .orderBy(adminCompaniesTable.name);
}

export async function runAdminMonthlyInvoiceRun(input: {
  periodStart: string;
  periodEnd: string;
  dryRun: boolean;
  actorLabel: string;
}): Promise<MonthlyInvoiceRunResult | { ok: false; error: string }> {
  const periodCheck = validateMonthlyRunPeriod(input.periodStart, input.periodEnd);
  if (!periodCheck.ok) return { ok: false, error: periodCheck.error };

  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };

  const periodStart = input.periodStart.trim();
  const periodEnd = input.periodEnd.trim();
  const issueDate = periodEnd;
  const dueDate = addCalendarDays(issueDate, INVOICE_DUE_DAYS);

  const companies = await listBillableCompanies(db);
  const results: MonthlyInvoiceRunCompanyResult[] = [];
  let createdCount = 0;
  let skippedCount = 0;
  let noRidesCount = 0;
  let errorCount = 0;
  let totalGrossCreated = 0;

  for (const company of companies) {
    const companyId = company.id;
    const companyName = String(company.name ?? "").trim() || companyId;
    const companyKind = String(company.company_kind ?? "").trim();
    const companyCode = String(company.company_code ?? "").trim() || null;

    const existing = await findExistingInvoiceForPeriod(db, companyId, periodStart, periodEnd);
    if (existing) {
      skippedCount += 1;
      results.push({
        companyId,
        companyName,
        companyKind,
        companyCode,
        outcome: "skipped",
        existingInvoiceId: existing.id,
        invoiceNumber: existing.invoice_number,
        subtotalNet: Number(existing.subtotal_net) || 0,
        vatTotal: Number(existing.vat_total) || 0,
        totalGross: Number(existing.total_gross) || 0,
        error: "invoice_period_already_exists",
      });
      continue;
    }

    const rides = await listEligibleRidesForCompany(db, companyId, periodStart, periodEnd);
    if (!rides.length) {
      noRidesCount += 1;
      results.push({
        companyId,
        companyName,
        companyKind,
        companyCode,
        outcome: "no_rides",
        rideCount: 0,
        totalGross: 0,
      });
      continue;
    }

    const items = buildInvoiceItemsFromRides(rides);
    const previewTotals = sumItemTotals(items);

    if (input.dryRun) {
      createdCount += 1;
      totalGrossCreated += previewTotals.totalGross;
      results.push({
        companyId,
        companyName,
        companyKind,
        companyCode,
        outcome: "created",
        rideCount: rides.length,
        subtotalNet: previewTotals.subtotalNet,
        vatTotal: previewTotals.vatTotal,
        totalGross: previewTotals.totalGross,
      });
      continue;
    }

    // company_code: bei Bedarf in allocatePartnerInvoiceNumberInTx nachgezogen (Onboarding-Lücke)
    try {
      await ensureCompanyInvoicePrefixFromKind(companyId);

      const txResult = await db.transaction(async (tx) => {
        const dup = await findExistingInvoiceForPeriod(tx, companyId, periodStart, periodEnd);
        if (dup) {
          return {
            ok: false as const,
            error: "invoice_period_already_exists",
            existingInvoiceId: dup.id,
            invoiceNumber: dup.invoice_number,
          };
        }

        const created = await createPartnerMonthlyInvoiceInTx(tx, {
          companyId,
          billingPeriodStart: periodStart,
          billingPeriodEnd: periodEnd,
          issueDate,
          dueDate,
          items,
          status: "issued",
          actorLabel: input.actorLabel,
          metadataExtra: {
            monthly_run: true,
            monthly_run_period_start: periodStart,
            monthly_run_period_end: periodEnd,
            ride_count: rides.length,
          },
        });

        if (!created.ok) return created;

        for (const ride of rides) {
          const prev = await tx
            .select({
              id: rideFinancialsTable.id,
              billing_status: rideFinancialsTable.billing_status,
            })
            .from(rideFinancialsTable)
            .where(eq(rideFinancialsTable.id, ride.financialId))
            .limit(1);
          const row = prev[0];
          if (!row) continue;

          await tx
            .update(rideFinancialsTable)
            .set({ billing_status: "invoiced", updated_at: new Date() })
            .where(eq(rideFinancialsTable.id, row.id));

          await insertFinancialAuditInTx(tx, {
            entityType: "ride_financial",
            entityId: row.id,
            action: "monthly_run_invoiced",
            oldValue: { billingStatus: row.billing_status },
            newValue: {
              billingStatus: "invoiced",
              invoiceId: created.invoiceId,
              invoiceNumber: created.invoiceNumber,
              periodStart,
              periodEnd,
            },
            actorType: "admin_console",
            actorId: input.actorLabel,
          });
        }

        await insertFinancialAuditInTx(tx, {
          entityType: "invoice",
          entityId: created.invoiceId,
          action: "invoice_monthly_run_created",
          newValue: {
            invoiceNumber: created.invoiceNumber,
            companyId,
            periodStart,
            periodEnd,
            rideCount: rides.length,
            totalGross: created.totalGross,
            dryRun: false,
          },
          actorType: "admin_console",
          actorId: input.actorLabel,
        });

        return created;
      });

      if (!txResult.ok) {
        if (txResult.error === "invoice_period_already_exists") {
          skippedCount += 1;
          results.push({
            companyId,
            companyName,
            companyKind,
            companyCode,
            outcome: "skipped",
            existingInvoiceId: txResult.existingInvoiceId,
            invoiceNumber: "invoiceNumber" in txResult ? txResult.invoiceNumber : undefined,
            rideCount: rides.length,
            totalGross: previewTotals.totalGross,
            error: txResult.error,
          });
        } else {
          errorCount += 1;
          results.push({
            companyId,
            companyName,
            companyKind,
            companyCode,
            outcome: "error",
            rideCount: rides.length,
            subtotalNet: previewTotals.subtotalNet,
            vatTotal: previewTotals.vatTotal,
            totalGross: previewTotals.totalGross,
            error: txResult.error,
          });
        }
        continue;
      }

      createdCount += 1;
      totalGrossCreated += txResult.totalGross;
      results.push({
        companyId,
        companyName,
        companyKind,
        companyCode,
        outcome: "created",
        rideCount: rides.length,
        subtotalNet: txResult.subtotalNet,
        vatTotal: txResult.vatTotal,
        totalGross: txResult.totalGross,
        invoiceId: txResult.invoiceId,
        invoiceNumber: txResult.invoiceNumber,
        paymentReference: txResult.paymentReference,
      });
    } catch (e: unknown) {
      errorCount += 1;
      const err = e as Error & { code?: string };
      results.push({
        companyId,
        companyName,
        companyKind,
        companyCode,
        outcome: "error",
        rideCount: rides.length,
        subtotalNet: previewTotals.subtotalNet,
        vatTotal: previewTotals.vatTotal,
        totalGross: previewTotals.totalGross,
        error: err.code ?? err.message ?? "monthly_run_failed",
      });
    }
  }

  return {
    ok: true,
    dryRun: input.dryRun,
    periodStart,
    periodEnd,
    summary: {
      companiesScanned: companies.length,
      createdCount,
      skippedCount,
      noRidesCount,
      errorCount,
      totalGrossCreated,
    },
    results: results.map(formatMonthlyRunReportRow),
  };
}
