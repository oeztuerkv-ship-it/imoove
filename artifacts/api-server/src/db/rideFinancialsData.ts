import { randomUUID } from "node:crypto";
import { eq, inArray, isNull, sql } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import {
  calculateRideFinancialsV1,
  deriveFinanceInitialStatuses,
  type FinanceCommissionType,
  type FinancePricingContext,
  type RideFinancialBillingStatus,
  type RideFinancialSettlementStatus,
} from "../lib/financeCalculationService";
import { isCashPaymentMethod } from "../lib/ridePaymentMethod";
import { rideHasLinkedKrankenInvoice } from "../lib/cashCardNettingScope";
import { getDb } from "./client";
import { financialAuditLogTable, invoiceItemsTable, rideFinancialsTable, ridesTable } from "./schema";
import { findRide } from "./ridesData";
import { logger } from "../lib/logger";

type PostgresDb = NonNullable<ReturnType<typeof getDb>>;

/** In `calculation_metadata_json`; eingefroren bei erstem Persist — spätere Operational-Änderungen ändern keine alte Provision. */
const FINANCE_PRICING_SNAPSHOT_KEY = "finance_pricing_snapshot";

function readFinancePricingSnapshot(meta: Record<string, unknown>): FinancePricingContext | null {
  const raw = meta[FINANCE_PRICING_SNAPSHOT_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const ct = o.commissionType;
  const cv = o.commissionValue;
  const vr = o.vatRate;
  if (typeof ct !== "string") return null;
  const commissionTypeAllowed: FinanceCommissionType[] = ["percentage", "fixed", "hybrid", "none"];
  if (!commissionTypeAllowed.includes(ct as FinanceCommissionType)) return null;
  const commissionType = ct as FinanceCommissionType;
  const commissionValue =
    typeof cv === "number" && Number.isFinite(cv)
      ? cv
      : typeof cv === "string" && cv.trim()
        ? Number(cv)
        : 0;
  const vatRate =
    typeof vr === "number" && Number.isFinite(vr)
      ? vr
      : typeof vr === "string" && vr.trim()
        ? Number(vr)
        : null;
  const minComm = o.minCommissionEur;
  const minCommissionEur =
    typeof minComm === "number" && Number.isFinite(minComm) ? minComm : null;
  return {
    commissionType,
    commissionValue: Number.isFinite(commissionValue) ? commissionValue : 0,
    vatRate,
    minCommissionEur,
  };
}

export function buildFinancePricingSnapshotPayload(
  incoming: FinancePricingContext | null | undefined,
  calc: ReturnType<typeof calculateRideFinancialsV1>,
): Record<string, unknown> {
  return {
    commissionType: calc.commissionType,
    commissionValue: calc.commissionValue,
    vatRate: calc.vatRate,
    minCommissionEur:
      incoming != null &&
      typeof incoming.minCommissionEur === "number" &&
      Number.isFinite(incoming.minCommissionEur)
        ? incoming.minCommissionEur
        : null,
    capturedAtIso: new Date().toISOString(),
  };
}

export const RIDE_FINANCIAL_BILLING_STATUSES: RideFinancialBillingStatus[] = [
  "unbilled",
  "queued",
  "invoiced",
  "partially_paid",
  "paid",
  "cancelled",
  "written_off",
];

export const RIDE_FINANCIAL_SETTLEMENT_STATUSES: RideFinancialSettlementStatus[] = [
  "open",
  "calculated",
  "approved",
  "paid_out",
  "held",
  "disputed",
];

type RideFinancialRow = typeof rideFinancialsTable.$inferSelect;

export interface FinanceActor {
  actorType?: string;
  actorId?: string | null;
}

export interface UpsertRideFinancialSnapshotInput extends FinanceActor {
  ride: RideRequest;
  pricingContext?: FinancePricingContext | null;
  reason?: string;
  forceRecalc?: boolean; // Bei completed: Lock ignorieren, Snapshot erzwingen
}

async function insertFinancialAuditLog(input: {
  entityType: string;
  entityId: string;
  action: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  actorType?: string;
  actorId?: string | null;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.insert(financialAuditLogTable).values({
    id: `fal-${randomUUID()}`,
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    old_value_json: input.oldValue ?? {},
    new_value_json: input.newValue ?? {},
    actor_type: input.actorType ?? "system",
    actor_id: input.actorId ?? null,
  });
}

/** Billing-/Invoice-Ereignis auf Ride-Ebene (query: entity_type ride + entity_id = rideId). */
export async function logFinancialAuditForRide(input: {
  rideId: string;
  action: string;
  newValue?: Record<string, unknown>;
  actorType?: string;
  actorId?: string | null;
}): Promise<void> {
  await insertFinancialAuditLog({
    entityType: "ride",
    entityId: input.rideId,
    action: input.action,
    newValue: input.newValue ?? {},
    actorType: input.actorType,
    actorId: input.actorId,
  });
}

function toPublicSnapshot(row: RideFinancialRow) {
  return {
    id: row.id,
    rideId: row.ride_id,
    payerType: row.payer_type,
    billingMode: row.billing_mode,
    serviceProviderCompanyId: row.service_provider_company_id,
    partnerCompanyId: row.partner_company_id,
    billingReference: row.billing_reference,
    grossAmount: row.gross_amount,
    netAmount: row.net_amount,
    vatRate: row.vat_rate,
    vatAmount: row.vat_amount,
    commissionType: row.commission_type,
    commissionValue: row.commission_value,
    commissionAmount: row.commission_amount,
    operatorPayoutAmount: row.operator_payout_amount,
    tipAmount: row.tip_amount ?? 0,
    stripeFeeAmount: row.stripe_fee_amount ?? 0,
    payoutLineStatus: row.payout_line_status ?? "offen",
    billingStatus: row.billing_status as RideFinancialBillingStatus,
    settlementStatus: row.settlement_status as RideFinancialSettlementStatus,
    calculationVersion: row.calculation_version,
    calculationRuleSet: row.calculation_rule_set ?? null,
    calculationMetadata: row.calculation_metadata_json ?? {},
    lockReason: row.lock_reason ?? null,
    correctionCount: row.correction_count ?? 0,
    lockedAt: row.locked_at,
    calculatedAt: row.calculated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getAutoLockReasonDb(rideId: string, db: PostgresDb): Promise<string | null> {
  const linkedInvoiceItem = await db
    .select({ id: invoiceItemsTable.id })
    .from(invoiceItemsTable)
    .where(eq(invoiceItemsTable.ride_id, rideId))
    .limit(1);
  if (linkedInvoiceItem[0]) return "invoice_item_assigned";
  return null;
}

async function getAutoLockReason(rideId: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  return getAutoLockReasonDb(rideId, db);
}

function isValidBillingStatus(value: string): value is RideFinancialBillingStatus {
  return (RIDE_FINANCIAL_BILLING_STATUSES as readonly string[]).includes(value);
}

function isValidSettlementStatus(value: string): value is RideFinancialSettlementStatus {
  return (RIDE_FINANCIAL_SETTLEMENT_STATUSES as readonly string[]).includes(value);
}

export async function mapBillingStatusByRideIds(
  rideIds: string[],
): Promise<Map<string, { billingStatus: string; settlementStatus: string }>> {
  const out = new Map<string, { billingStatus: string; settlementStatus: string }>();
  const db = getDb();
  if (!db || rideIds.length === 0) return out;
  const ids = [...new Set(rideIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return out;
  const rows = await db
    .select({
      rideId: rideFinancialsTable.ride_id,
      billingStatus: rideFinancialsTable.billing_status,
      settlementStatus: rideFinancialsTable.settlement_status,
    })
    .from(rideFinancialsTable)
    .where(inArray(rideFinancialsTable.ride_id, ids));
  for (const row of rows) {
    out.set(row.rideId, {
      billingStatus: String(row.billingStatus ?? "unbilled"),
      settlementStatus: String(row.settlementStatus ?? "open"),
    });
  }
  return out;
}

export async function getRideFinancialSnapshotByRideId(rideId: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(rideFinancialsTable)
    .where(eq(rideFinancialsTable.ride_id, rideId))
    .limit(1);
  const row = rows[0];
  return row ? toPublicSnapshot(row) : null;
}

export async function upsertRideFinancialSnapshot(
  input: UpsertRideFinancialSnapshotInput,
): Promise<{ ok: true; snapshotId: string; skipped?: boolean } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };

  return await db.transaction(async (tx) => {
    const { ride } = input;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ride.id}))`);

    const existingRows = await tx
      .select()
      .from(rideFinancialsTable)
      .where(eq(rideFinancialsTable.ride_id, ride.id))
      .limit(1);
    let existing = existingRows[0];
    const autoLockReason = await getAutoLockReasonDb(ride.id, tx);

    if (existing?.locked_at && !input.forceRecalc) {
      return { ok: true, snapshotId: existing.id, skipped: true };
    }

    if (existing && autoLockReason && !existing.locked_at) {
      const now = new Date();
      await tx
        .update(rideFinancialsTable)
        .set({
          locked_at: now,
          lock_reason: autoLockReason,
          updated_at: now,
        })
        .where(eq(rideFinancialsTable.id, existing.id));
      await insertFinancialAuditLog({
        entityType: "ride_financial",
        entityId: existing.id,
        action: "snapshot_locked",
        oldValue: { lockReason: existing.lock_reason ?? null },
        newValue: { lockReason: autoLockReason },
        actorType: input.actorType,
        actorId: input.actorId,
      });
      return { ok: true, snapshotId: existing.id, skipped: true };
    }

    const now = new Date();

    /** Legacy-Zeilen ohne Freeze: erste erfolgreiche Upsert-Änderung hängt finance_pricing_snapshot an. */
    const existingMeta: Record<string, unknown> =
      existing?.calculation_metadata_json &&
      typeof existing.calculation_metadata_json === "object" &&
      !Array.isArray(existing.calculation_metadata_json)
        ? { ...(existing.calculation_metadata_json as Record<string, unknown>) }
        : {};
    const frozenCtx = readFinancePricingSnapshot(existingMeta);
    const pricingForCalc = frozenCtx ?? input.pricingContext ?? null;
    let calc = calculateRideFinancialsV1({
      ride,
      pricingContext: pricingForCalc,
      partnerCompanyId: ride.companyId ?? null,
      serviceProviderCompanyId: ride.companyId ?? null,
    });

    if (!existing) {
      const initialStatuses = deriveFinanceInitialStatuses(ride);
      const id = `rf-${randomUUID()}`;
      const snap = buildFinancePricingSnapshotPayload(input.pricingContext, calc);
      const calculation_metadata_json: Record<string, unknown> = {
        ...calc.calculationMetadata,
        [FINANCE_PRICING_SNAPSHOT_KEY]: snap,
      };
      await tx.insert(rideFinancialsTable).values({
        id,
        ride_id: ride.id,
        payer_type: calc.payerType,
        billing_mode: calc.billingMode,
        service_provider_company_id: calc.serviceProviderCompanyId,
        partner_company_id: calc.partnerCompanyId,
        billing_reference: ride.billingReference ?? "",
        gross_amount: calc.grossAmount,
        net_amount: calc.netAmount,
        vat_rate: calc.vatRate,
        vat_amount: calc.vatAmount,
        commission_type: calc.commissionType,
        commission_value: calc.commissionValue,
        commission_amount: calc.commissionAmount,
        operator_payout_amount: calc.operatorPayoutAmount,
        billing_status: initialStatuses.billingStatus,
        settlement_status: initialStatuses.settlementStatus,
        calculated_at: now,
        calculation_version: calc.calculationVersion,
        calculation_rule_set: calc.calculationRuleSet,
        calculation_metadata_json,
        lock_reason: autoLockReason,
        locked_at: autoLockReason ? now : null,
        updated_at: now,
      });
      await insertFinancialAuditLog({
        entityType: "ride_financial",
        entityId: id,
        action: "snapshot_created",
        newValue: {
          rideId: ride.id,
          calculationVersion: calc.calculationVersion,
          reason: input.reason ?? "ride_completed",
        },
        actorType: input.actorType,
        actorId: input.actorId,
      });
      return { ok: true, snapshotId: id };
    }

    const persistedSnapRaw = existingMeta[FINANCE_PRICING_SNAPSHOT_KEY];
    const pricingSnap =
      persistedSnapRaw &&
      typeof persistedSnapRaw === "object" &&
      !Array.isArray(persistedSnapRaw)
        ? (persistedSnapRaw as Record<string, unknown>)
        : buildFinancePricingSnapshotPayload(input.pricingContext, calc);

    const mergedSnapMeta = {
      ...existingMeta,
      [FINANCE_PRICING_SNAPSHOT_KEY]: pricingSnap,
    };
    calc = calculateRideFinancialsV1({
      ride,
      pricingContext:
        readFinancePricingSnapshot(mergedSnapMeta as Record<string, unknown>) ??
        frozenCtx ??
        input.pricingContext ??
        null,
      partnerCompanyId: ride.companyId ?? null,
      serviceProviderCompanyId: ride.companyId ?? null,
    });

    const calculation_metadata_json = {
      ...existingMeta,
      ...calc.calculationMetadata,
      [FINANCE_PRICING_SNAPSHOT_KEY]: pricingSnap,
    };

    await tx
      .update(rideFinancialsTable)
      .set({
        payer_type: calc.payerType,
        billing_mode: calc.billingMode,
        service_provider_company_id: calc.serviceProviderCompanyId,
        partner_company_id: calc.partnerCompanyId,
        billing_reference: ride.billingReference ?? "",
        gross_amount: calc.grossAmount,
        net_amount: calc.netAmount,
        vat_rate: calc.vatRate,
        vat_amount: calc.vatAmount,
        commission_type: calc.commissionType,
        commission_value: calc.commissionValue,
        commission_amount: calc.commissionAmount,
        operator_payout_amount: calc.operatorPayoutAmount,
        calculation_version: calc.calculationVersion,
        calculation_rule_set: calc.calculationRuleSet,
        calculation_metadata_json,
        calculated_at: now,
        updated_at: now,
      })
      .where(eq(rideFinancialsTable.id, existing.id));

    await insertFinancialAuditLog({
      entityType: "ride_financial",
      entityId: existing.id,
      action: "snapshot_updated",
      oldValue: {
        calculationVersion: existing.calculation_version,
        grossAmount: existing.gross_amount,
        netAmount: existing.net_amount,
      },
      newValue: {
        calculationVersion: calc.calculationVersion,
        grossAmount: calc.grossAmount,
        netAmount: calc.netAmount,
        reason: input.reason ?? "refresh",
      },
      actorType: input.actorType,
      actorId: input.actorId,
    });
    return { ok: true, snapshotId: existing.id };
  });
}

export async function lockRideFinancialSnapshot(
  rideId: string,
  reason: string,
  actor?: FinanceActor,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const rows = await db
    .select()
    .from(rideFinancialsTable)
    .where(eq(rideFinancialsTable.ride_id, rideId))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, error: "snapshot_not_found" };
  if (row.locked_at) return { ok: true };
  const now = new Date();
  await db
    .update(rideFinancialsTable)
    .set({
      locked_at: now,
      lock_reason: reason.trim() || "manual_lock",
      updated_at: now,
    })
    .where(eq(rideFinancialsTable.id, row.id));
  await insertFinancialAuditLog({
    entityType: "ride_financial",
    entityId: row.id,
    action: "snapshot_locked",
    oldValue: { lockReason: row.lock_reason ?? null },
    newValue: { lockReason: reason.trim() || "manual_lock" },
    actorType: actor?.actorType,
    actorId: actor?.actorId,
  });
  return { ok: true };
}

export async function correctRideFinancialSnapshot(input: {
  ride: RideRequest;
  reason: string;
  pricingContext?: FinancePricingContext | null;
  actorType?: string;
  actorId?: string | null;
}): Promise<{ ok: true; snapshotId: string } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "correction_reason_required" };

  const rows = await db
    .select()
    .from(rideFinancialsTable)
    .where(eq(rideFinancialsTable.ride_id, input.ride.id))
    .limit(1);
  const existing = rows[0];
  if (!existing) {
    return upsertRideFinancialSnapshot({
      ride: input.ride,
      pricingContext: input.pricingContext ?? null,
      reason,
      actorType: input.actorType,
      actorId: input.actorId,
    });
  }

  await insertFinancialAuditLog({
    entityType: "ride_financial",
    entityId: existing.id,
    action: "correction_started",
    oldValue: {
      calculationVersion: existing.calculation_version,
      lockedAt: existing.locked_at ? existing.locked_at.toISOString() : null,
    },
    newValue: { reason },
    actorType: input.actorType,
    actorId: input.actorId,
  });

  const prevMeta: Record<string, unknown> =
    existing.calculation_metadata_json &&
    typeof existing.calculation_metadata_json === "object" &&
    !Array.isArray(existing.calculation_metadata_json)
      ? ({ ...(existing.calculation_metadata_json as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  const calc = calculateRideFinancialsV1({
    ride: input.ride,
    pricingContext: input.pricingContext ?? readFinancePricingSnapshot(prevMeta) ?? null,
    partnerCompanyId: input.ride.companyId ?? null,
    serviceProviderCompanyId: input.ride.companyId ?? null,
  });
  const now = new Date();
  const correctionCount = Number(existing.correction_count ?? 0) + 1;

  const correctionSnapRaw = prevMeta[FINANCE_PRICING_SNAPSHOT_KEY];
  const correctionSnap =
    input.pricingContext != null
      ? buildFinancePricingSnapshotPayload(input.pricingContext, calc)
      : correctionSnapRaw &&
          typeof correctionSnapRaw === "object" &&
          !Array.isArray(correctionSnapRaw)
        ? (correctionSnapRaw as Record<string, unknown>)
        : buildFinancePricingSnapshotPayload(readFinancePricingSnapshot(prevMeta), calc);

  await db
    .update(rideFinancialsTable)
    .set({
      payer_type: calc.payerType,
      billing_mode: calc.billingMode,
      service_provider_company_id: calc.serviceProviderCompanyId,
      partner_company_id: calc.partnerCompanyId,
      billing_reference: input.ride.billingReference ?? "",
      gross_amount: calc.grossAmount,
      net_amount: calc.netAmount,
      vat_rate: calc.vatRate,
      vat_amount: calc.vatAmount,
      commission_type: calc.commissionType,
      commission_value: calc.commissionValue,
      commission_amount: calc.commissionAmount,
      operator_payout_amount: calc.operatorPayoutAmount,
      calculation_version: `${calc.calculationVersion}:corr_${correctionCount}`,
      calculation_rule_set: calc.calculationRuleSet,
      calculation_metadata_json: {
        ...prevMeta,
        ...calc.calculationMetadata,
        [FINANCE_PRICING_SNAPSHOT_KEY]: correctionSnap,
        correctionReason: reason,
      },
      correction_count: correctionCount,
      last_correction_at: now,
      locked_at: now,
      lock_reason: `corrected:${reason}`,
      calculated_at: now,
      updated_at: now,
    })
    .where(eq(rideFinancialsTable.id, existing.id));

  await insertFinancialAuditLog({
    entityType: "ride_financial",
    entityId: existing.id,
    action: "snapshot_corrected",
    oldValue: {
      calculationVersion: existing.calculation_version,
      correctionCount: existing.correction_count ?? 0,
    },
    newValue: {
      calculationVersion: `${calc.calculationVersion}:corr_${correctionCount}`,
      correctionCount,
      reason,
    },
    actorType: input.actorType,
    actorId: input.actorId,
  });
  return { ok: true, snapshotId: existing.id };
}

export async function updateRideFinancialStatuses(input: {
  rideId: string;
  billingStatus?: RideFinancialBillingStatus;
  settlementStatus?: RideFinancialSettlementStatus;
  reason?: string;
  actorType?: string;
  actorId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const rows = await db
    .select()
    .from(rideFinancialsTable)
    .where(eq(rideFinancialsTable.ride_id, input.rideId))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, error: "snapshot_not_found" };

  const billingStatus = input.billingStatus ?? (row.billing_status as RideFinancialBillingStatus);
  const settlementStatus = input.settlementStatus ?? (row.settlement_status as RideFinancialSettlementStatus);
  if (!isValidBillingStatus(billingStatus)) return { ok: false, error: "billing_status_invalid" };
  if (!isValidSettlementStatus(settlementStatus)) return { ok: false, error: "settlement_status_invalid" };

  await db
    .update(rideFinancialsTable)
    .set({
      billing_status: billingStatus,
      settlement_status: settlementStatus,
      updated_at: new Date(),
    })
    .where(eq(rideFinancialsTable.id, row.id));

  await insertFinancialAuditLog({
    entityType: "ride_financial",
    entityId: row.id,
    action: "status_changed",
    oldValue: {
      billingStatus: row.billing_status,
      settlementStatus: row.settlement_status,
    },
    newValue: {
      billingStatus,
      settlementStatus,
      reason: input.reason ?? "manual_status_update",
    },
    actorType: input.actorType,
    actorId: input.actorId,
  });
  return { ok: true };
}

export type PayoutLineStatus = "offen" | "ausgezahlt";

export const PAYOUT_LINE_STATUSES: PayoutLineStatus[] = ["offen", "ausgezahlt"];

/** Manuelle Auszahlung: payout_line_status → ausgezahlt (kein Stripe Connect). */
export async function markRideFinancialPayoutAusgezahlt(input: {
  rideId: string;
  actorType?: string;
  actorId?: string | null;
}): Promise<{ ok: true; idempotent?: boolean } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const rideId = input.rideId.trim();
  if (!rideId) return { ok: false, error: "ride_id_required" };

  const rows = await db
    .select()
    .from(rideFinancialsTable)
    .where(eq(rideFinancialsTable.ride_id, rideId))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, error: "snapshot_not_found" };

  if (row.payout_line_status === "ausgezahlt") {
    return { ok: true, idempotent: true };
  }

  const payout = Number(row.operator_payout_amount ?? 0);
  if (!Number.isFinite(payout) || payout <= 0) {
    return { ok: false, error: "payout_not_positive" };
  }

  if (await rideHasLinkedKrankenInvoice(rideId)) {
    return { ok: false, error: "linked_kranken_invoice" };
  }

  const now = new Date();
  await db
    .update(rideFinancialsTable)
    .set({
      payout_line_status: "ausgezahlt",
      settlement_status: "paid_out",
      updated_at: now,
    })
    .where(eq(rideFinancialsTable.id, row.id));

  await insertFinancialAuditLog({
    entityType: "ride_financial",
    entityId: row.id,
    action: "payout_line_marked_ausgezahlt",
    oldValue: {
      payoutLineStatus: row.payout_line_status,
      settlementStatus: row.settlement_status,
    },
    newValue: {
      payoutLineStatus: "ausgezahlt",
      settlementStatus: "paid_out",
    },
    actorType: input.actorType ?? "admin",
    actorId: input.actorId,
  });

  return { ok: true };
}

function pushBlocker(blockers: string[], value: string) {
  if (!blockers.includes(value)) blockers.push(value);
}

export function getInvoiceEligibility(input: {
  ride: RideRequest;
  snapshot: {
    payerType: string;
    billingMode: string;
    billingReference?: string | null;
    billingStatus: RideFinancialBillingStatus;
  } | null;
}): { eligible: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (input.ride.status !== "completed") pushBlocker(blockers, "ride_not_completed");
  if (input.ride.status.startsWith("cancelled")) pushBlocker(blockers, "cancelled_ride");
  if (!input.snapshot) pushBlocker(blockers, "missing_snapshot");
  if (input.snapshot && !input.snapshot.payerType) pushBlocker(blockers, "missing_payer");
  if (input.snapshot && !input.snapshot.billingMode) pushBlocker(blockers, "missing_billing_mode");
  if (input.snapshot && !["unbilled", "queued"].includes(input.snapshot.billingStatus)) {
    pushBlocker(blockers, "billing_status_not_invoice_eligible");
  }
  const billingReference = input.snapshot?.billingReference ?? input.ride.billingReference ?? "";
  const refRequired = input.ride.payerKind === "insurance" || input.ride.payerKind === "company";
  if (refRequired && !billingReference.trim()) pushBlocker(blockers, "missing_billing_reference");
  if (input.ride.rideKind === "medical") {
    const pm = input.ride.partnerBookingMeta as Record<string, unknown> | null | undefined;
    const isFlatMedicalRide = pm && typeof pm === "object" && pm.medical_ride === true;
    if (!isFlatMedicalRide && !input.ride.partnerBookingMeta?.medical?.patientReference?.trim()) {
      pushBlocker(blockers, "incomplete_medical_fields");
    }
  }
  if (input.ride.payerKind === "insurance" && !billingReference.trim()) {
    pushBlocker(blockers, "incomplete_insurance_fields");
  }
  return { eligible: blockers.length === 0, blockers };
}

export function getSettlementEligibility(input: {
  ride: RideRequest;
  snapshot: {
    serviceProviderCompanyId?: string | null;
    settlementStatus: RideFinancialSettlementStatus;
  } | null;
}): { eligible: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (input.ride.status !== "completed") pushBlocker(blockers, "ride_not_completed");
  if (input.ride.status.startsWith("cancelled")) pushBlocker(blockers, "cancelled_ride");
  if (!input.snapshot) pushBlocker(blockers, "missing_snapshot");
  if (input.snapshot && !input.snapshot.serviceProviderCompanyId) {
    pushBlocker(blockers, "missing_service_provider");
  }
  if (input.snapshot && !["open", "calculated"].includes(input.snapshot.settlementStatus)) {
    pushBlocker(blockers, "settlement_status_not_eligible");
  }
  if (input.ride.rideKind === "medical") {
    const pm = input.ride.partnerBookingMeta as Record<string, unknown> | null | undefined;
    const isFlatMedicalRide = pm && typeof pm === "object" && pm.medical_ride === true;
    if (!isFlatMedicalRide && !input.ride.partnerBookingMeta?.medical?.patientReference?.trim()) {
      pushBlocker(blockers, "incomplete_medical_fields");
    }
  }
  return { eligible: blockers.length === 0, blockers };
}

/** Async: Settlement/Auszahlung nur ohne echte KK-Rechnung (Flat-Medical ok). */
export async function getSettlementEligibilityWithNettingScope(input: {
  ride: RideRequest;
  snapshot: {
    serviceProviderCompanyId?: string | null;
    settlementStatus: RideFinancialSettlementStatus;
  } | null;
}): Promise<{ eligible: boolean; blockers: string[] }> {
  const base = getSettlementEligibility(input);
  if (!base.eligible) return base;
  if (await rideHasLinkedKrankenInvoice(input.ride.id)) {
    return { eligible: false, blockers: [...base.blockers, "linked_kranken_invoice"] };
  }
  return base;
}

/** Trinkgeld nach Fahrtende — ohne Provision, nur Snapshot-Spalte. */
export async function patchRideFinancialTipAmount(rideId: string, tipAmount: number): Promise<void> {
  const db = getDb();
  if (!db) return;
  const safe = Number.isFinite(tipAmount) ? Math.max(0, tipAmount) : 0;
  const now = new Date();
  await db
    .update(rideFinancialsTable)
    .set({ tip_amount: safe, updated_at: now })
    .where(eq(rideFinancialsTable.ride_id, rideId.trim()));
}

/**
 * Phase A Cash-Netting: offene (nicht gelockte) Bar-Fahrten neu berechnen.
 * Gelockte Snapshots bleiben unverändert. Ohne forceRecalc.
 */
export async function recalcUnlockedCashRideFinancials(opts?: {
  limit?: number;
  actorType?: string;
  actorId?: string | null;
}): Promise<{
  scanned: number;
  updated: number;
  skippedLocked: number;
  skippedNotCash: number;
  failed: number;
  errors: Array<{ rideId: string; error: string }>;
}> {
  const db = getDb();
  if (!db) {
    return { scanned: 0, updated: 0, skippedLocked: 0, skippedNotCash: 0, failed: 0, errors: [] };
  }
  const limit = Math.min(5000, Math.max(1, opts?.limit ?? 2000));
  const rows = await db
    .select({
      rideId: rideFinancialsTable.ride_id,
      lockedAt: rideFinancialsTable.locked_at,
      paymentMethod: ridesTable.payment_method,
    })
    .from(rideFinancialsTable)
    .innerJoin(ridesTable, eq(ridesTable.id, rideFinancialsTable.ride_id))
    .where(isNull(rideFinancialsTable.locked_at))
    .limit(limit);

  let updated = 0;
  let skippedNotCash = 0;
  let failed = 0;
  const errors: Array<{ rideId: string; error: string }> = [];

  for (const row of rows) {
    if (!isCashPaymentMethod(row.paymentMethod)) {
      skippedNotCash += 1;
      continue;
    }
    const ride = await findRide(row.rideId);
    if (!ride) {
      failed += 1;
      errors.push({ rideId: row.rideId, error: "ride_not_found" });
      continue;
    }
    try {
      const out = await upsertRideFinancialSnapshot({
        ride,
        reason: "cash_netting_recalc_unlocked",
        actorType: opts?.actorType ?? "system",
        actorId: opts?.actorId ?? "cash_netting_phase_a",
      });
      if (!out.ok) {
        failed += 1;
        errors.push({ rideId: row.rideId, error: out.error });
        continue;
      }
      if (out.skipped) {
        // race: inzwischen gelockt
        continue;
      }
      updated += 1;
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ rideId: row.rideId, error: msg });
      logger.warn({ err, rideId: row.rideId }, "[finance] cash netting recalc failed");
    }
  }

  return {
    scanned: rows.length,
    updated,
    skippedLocked: 0,
    skippedNotCash,
    failed,
    errors: errors.slice(0, 50),
  };
}
