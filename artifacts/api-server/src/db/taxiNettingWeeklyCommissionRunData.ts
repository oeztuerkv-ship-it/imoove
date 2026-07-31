import { randomUUID } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  buildPanelAdjustmentEffectiveAtDateRangeFilter,
  buildPanelSettlementCompletedAtDateRangeFilter,
  queryPanelFinancialSettlement,
} from "./panelOverviewSettlementData";
import {
  createPartnerMonthlyInvoiceInTx,
  ensureCompanyInvoicePrefixFromKind,
} from "./partnerInvoiceGeneratorData";
import {
  adminCompaniesTable,
  financialAuditLogTable,
  invoicesTable,
  settlementsTable,
} from "./schema";
import { CASH_CARD_NETTING_COMPANY_KIND } from "../lib/cashCardNettingScope";
import { addCalendarDays } from "../lib/monthlyInvoiceRun";
import { deriveSettlementDirection, roundSettlementMoney } from "../lib/settlementDirection";
import {
  berlinCalendarWeekPeriod,
  validateInclusiveDatePeriod,
  weeklyCommissionIdempotencyKey,
} from "../lib/taxiNettingWeeklyPeriod";
import { logger } from "../lib/logger";

type ExecDb = NonNullable<ReturnType<typeof getDb>>;

const INVOICE_DUE_DAYS = 14;

export type WeeklyCommissionRunOutcome =
  | "created_debt_invoice"
  | "created_settlement_only"
  | "skipped_balanced"
  | "skipped_existing"
  | "error";

export type WeeklyCommissionRunCompanyResult = {
  companyId: string;
  companyName: string;
  outcome: WeeklyCommissionRunOutcome;
  payoutAmount?: number;
  direction?: string;
  settlementId?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  error?: string;
};

export type WeeklyCommissionRunResult = {
  ok: true;
  dryRun: boolean;
  periodStart: string;
  periodEnd: string;
  companiesScanned: number;
  createdDebtInvoiceCount: number;
  createdSettlementOnlyCount: number;
  skippedBalancedCount: number;
  skippedExistingCount: number;
  errorCount: number;
  results: WeeklyCommissionRunCompanyResult[];
};

async function listTaxiCompanies(db: ExecDb) {
  return db
    .select({
      id: adminCompaniesTable.id,
      name: adminCompaniesTable.name,
      company_code: adminCompaniesTable.company_code,
      is_active: adminCompaniesTable.is_active,
    })
    .from(adminCompaniesTable)
    .where(
      and(
        eq(adminCompaniesTable.is_active, true),
        sql`lower(trim(${adminCompaniesTable.company_kind})) = ${CASH_CARD_NETTING_COMPANY_KIND}`,
      ),
    )
    .orderBy(adminCompaniesTable.name);
}

async function findSettlementByIdempotency(db: ExecDb, key: string) {
  const rows = await db
    .select()
    .from(settlementsTable)
    .where(eq(settlementsTable.idempotency_key, key))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Wochenlauf Taxi-Netting: Settlement mit Richtung; bei Negativsaldo Provisionsrechnung (invoices).
 * Default-Periode = letzte abgeschlossene Kalenderwoche (Mo–So, Europe/Berlin).
 */
export async function runTaxiNettingWeeklyCommissionRun(input: {
  periodStart?: string;
  periodEnd?: string;
  dryRun?: boolean;
  actorLabel: string;
}): Promise<WeeklyCommissionRunResult | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };

  let periodStart: string;
  let periodEnd: string;
  if (input.periodStart || input.periodEnd) {
    const validated = validateInclusiveDatePeriod(
      String(input.periodStart ?? ""),
      String(input.periodEnd ?? ""),
    );
    if (!validated.ok) return { ok: false, error: validated.error };
    periodStart = validated.periodStart;
    periodEnd = validated.periodEnd;
  } else {
    const w = berlinCalendarWeekPeriod(1);
    periodStart = w.periodStart;
    periodEnd = w.periodEnd;
  }

  const dryRun = Boolean(input.dryRun);
  const companies = await listTaxiCompanies(db);
  const rideFilter = buildPanelSettlementCompletedAtDateRangeFilter(periodStart, periodEnd);
  const adjFilter = buildPanelAdjustmentEffectiveAtDateRangeFilter(periodStart, periodEnd);
  const issueDate = periodEnd;
  const dueDate = addCalendarDays(issueDate, INVOICE_DUE_DAYS);

  const results: WeeklyCommissionRunCompanyResult[] = [];
  let createdDebtInvoiceCount = 0;
  let createdSettlementOnlyCount = 0;
  let skippedBalancedCount = 0;
  let skippedExistingCount = 0;
  let errorCount = 0;

  for (const company of companies) {
    const companyId = company.id;
    const companyName = String(company.name ?? "").trim() || companyId;
    const idemKey = weeklyCommissionIdempotencyKey(companyId, periodStart, periodEnd);

    try {
      const existing = await findSettlementByIdempotency(db, idemKey);
      if (existing) {
        skippedExistingCount += 1;
        results.push({
          companyId,
          companyName,
          outcome: "skipped_existing",
          settlementId: existing.id,
          payoutAmount: Number(existing.payout_amount) || 0,
          direction: String(existing.direction ?? ""),
          invoiceId: existing.commission_invoice_id ?? undefined,
        });
        continue;
      }

      const window = await queryPanelFinancialSettlement(db, companyId, rideFilter, adjFilter);
      const payoutAmount = roundSettlementMoney(window.operatorPayoutAmount);
      const direction = deriveSettlementDirection(payoutAmount);
      const gross = roundSettlementMoney(window.grossAmount);
      const commission = roundSettlementMoney(window.commissionAmount);
      const adjustments = roundSettlementMoney(window.adjustmentOperatorPayoutDelta);

      if (Math.abs(payoutAmount) < 0.005) {
        skippedBalancedCount += 1;
        results.push({
          companyId,
          companyName,
          outcome: "skipped_balanced",
          payoutAmount: 0,
          direction: "platform_pays_partner",
        });
        continue;
      }

      if (dryRun) {
        if (direction === "partner_pays_platform") {
          createdDebtInvoiceCount += 1;
          results.push({
            companyId,
            companyName,
            outcome: "created_debt_invoice",
            payoutAmount,
            direction,
          });
        } else {
          createdSettlementOnlyCount += 1;
          results.push({
            companyId,
            companyName,
            outcome: "created_settlement_only",
            payoutAmount,
            direction,
          });
        }
        continue;
      }

      const companyCode = String(company.company_code ?? "").trim();
      if (direction === "partner_pays_platform" && !companyCode) {
        errorCount += 1;
        results.push({
          companyId,
          companyName,
          outcome: "error",
          payoutAmount,
          direction,
          error: "company_code_required",
        });
        continue;
      }

      if (direction === "partner_pays_platform") {
        await ensureCompanyInvoicePrefixFromKind(companyId);
      }

      const debtGross = roundSettlementMoney(Math.abs(payoutAmount));

      const txOut = await db.transaction(async (tx) => {
        const raced = await tx
          .select()
          .from(settlementsTable)
          .where(eq(settlementsTable.idempotency_key, idemKey))
          .limit(1);
        if (raced[0]) {
          return { kind: "existing" as const, settlement: raced[0] };
        }

        const settlementId = `setl-${randomUUID().replace(/-/g, "").slice(0, 22)}`;
        const settlementNumber = `ST-W-${periodStart.replace(/-/g, "")}-${randomUUID().slice(0, 6)}`;

        let invoiceId: string | null = null;
        let invoiceNumber: string | null = null;

        if (direction === "partner_pays_platform") {
          const dupInv = await tx
            .select({ id: invoicesTable.id })
            .from(invoicesTable)
            .where(
              and(
                eq(invoicesTable.company_id, companyId),
                eq(invoicesTable.billing_period_start, periodStart),
                eq(invoicesTable.billing_period_end, periodEnd),
                ne(invoicesTable.status, "cancelled"),
                sql`coalesce(${invoicesTable.metadata_json}->>'source', '') = 'cash_card_netting_weekly_commission'`,
              ),
            )
            .limit(1);
          if (dupInv[0]) {
            invoiceId = dupInv[0].id;
          } else {
            const created = await createPartnerMonthlyInvoiceInTx(tx, {
              companyId,
              billingPeriodStart: periodStart,
              billingPeriodEnd: periodEnd,
              issueDate,
              dueDate,
              status: "issued",
              actorLabel: input.actorLabel,
              allowDuplicatePeriod: true,
              notes: `Provisionsnachzahlung Taxi-Netting Kalenderwoche ${periodStart}–${periodEnd} (Negativsaldo).`,
              metadataExtra: {
                source: "cash_card_netting_weekly_commission",
                settlement_direction: direction,
                netting_payout_amount: payoutAmount,
                period_start: periodStart,
                period_end: periodEnd,
              },
              items: [
                {
                  itemType: "platform_commission_debt",
                  description: `ONRODA-Provision / Netting-Schuld KW ${periodStart}–${periodEnd}`,
                  quantity: 1,
                  unitNet: debtGross,
                  vatRate: 0,
                  lineNet: debtGross,
                  lineVat: 0,
                  lineGross: debtGross,
                  metadata: { netting_payout_amount: payoutAmount },
                },
              ],
            });
            if (!created.ok) {
              throw Object.assign(new Error(created.error), { code: created.error });
            }
            invoiceId = created.invoiceId;
            invoiceNumber = created.invoiceNumber;
          }
        }

        await tx.insert(settlementsTable).values({
          id: settlementId,
          company_id: companyId,
          settlement_number: settlementNumber,
          period_start: periodStart,
          period_end: periodEnd,
          gross_revenue: gross,
          platform_commission: commission,
          adjustments,
          payout_amount: payoutAmount,
          direction,
          commission_invoice_id: invoiceId,
          status: direction === "partner_pays_platform" ? "issued" : "draft",
          payment_reference: "",
          idempotency_key: idemKey,
          metadata_json: {
            source: "cash_card_netting_weekly_run",
            createdByActor: input.actorLabel,
            adjustmentCount: window.adjustmentCount,
          },
        });

        await tx.insert(financialAuditLogTable).values({
          id: `fal-${randomUUID()}`,
          entity_type: "settlement",
          entity_id: settlementId,
          action: "settlement_weekly_netting_run",
          old_value_json: {},
          new_value_json: {
            companyId,
            periodStart,
            periodEnd,
            payoutAmount,
            direction,
            invoiceId,
          },
          actor_type: "admin",
          actor_id: input.actorLabel,
        });

        return {
          kind: "created" as const,
          settlementId,
          invoiceId,
          invoiceNumber,
        };
      });

      if (txOut.kind === "existing") {
        skippedExistingCount += 1;
        results.push({
          companyId,
          companyName,
          outcome: "skipped_existing",
          settlementId: txOut.settlement.id,
          payoutAmount: Number(txOut.settlement.payout_amount) || 0,
          direction: String(txOut.settlement.direction ?? ""),
          invoiceId: txOut.settlement.commission_invoice_id ?? undefined,
        });
        continue;
      }

      if (direction === "partner_pays_platform") {
        createdDebtInvoiceCount += 1;
        results.push({
          companyId,
          companyName,
          outcome: "created_debt_invoice",
          payoutAmount,
          direction,
          settlementId: txOut.settlementId,
          invoiceId: txOut.invoiceId ?? undefined,
          invoiceNumber: txOut.invoiceNumber ?? undefined,
        });
      } else {
        createdSettlementOnlyCount += 1;
        results.push({
          companyId,
          companyName,
          outcome: "created_settlement_only",
          payoutAmount,
          direction,
          settlementId: txOut.settlementId,
        });
      }
    } catch (err) {
      errorCount += 1;
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ err, companyId, periodStart, periodEnd }, "[finance] weekly commission run company failed");
      results.push({
        companyId,
        companyName,
        outcome: "error",
        error: message,
      });
    }
  }

  return {
    ok: true,
    dryRun,
    periodStart,
    periodEnd,
    companiesScanned: companies.length,
    createdDebtInvoiceCount,
    createdSettlementOnlyCount,
    skippedBalancedCount,
    skippedExistingCount,
    errorCount,
    results,
  };
}
