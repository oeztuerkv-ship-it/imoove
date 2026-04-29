import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import {
  calculateRideFinancialsV1,
  deriveFinanceInitialStatuses,
  type FinancePricingContext,
  type RideFinancialBillingStatus,
  type RideFinancialSettlementStatus,
} from "../lib/financeCalculationService";
import { getDb } from "./client";
import { financialAuditLogTable, invoiceItemsTable, rideFinancialsTable } from "./schema";

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

async function getAutoLockReason(rideId: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const linkedInvoiceItem = await db
    .select({ id: invoiceItemsTable.id })
    .from(invoiceItemsTable)
    .where(eq(invoiceItemsTable.ride_id, rideId))
    .limit(1);
  if (linkedInvoiceItem[0]) return "invoice_item_assigned";
  return null;
}

function isValidBillingStatus(value: string): value is RideFinancialBillingStatus {
  return (RIDE_FINANCIAL_BILLING_STATUSES as readonly string[]).includes(value);
}

function isValidSettlementStatus(value: string): value is RideFinancialSettlementStatus {
  return (RIDE_FINANCIAL_SETTLEMENT_STATUSES as readonly string[]).includes(value);
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
): Promise<{ ok: true; snapshotId: string } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };

  const { ride } = input;
  const calc = calculateRideFinancialsV1({
    ride,
    pricingContext: input.pricingContext ?? null,
    partnerCompanyId: ride.companyId ?? null,
    serviceProviderCompanyId: ride.companyId ?? null,
  });
  const initialStatuses = deriveFinanceInitialStatuses(ride);
  const now = new Date();
  const autoLockReason = await getAutoLockReason(ride.id);

  const existingRows = await db
    .select()
    .from(rideFinancialsTable)
    .where(eq(rideFinancialsTable.ride_id, ride.id))
    .limit(1);
  const existing = existingRows[0];

  if (!existing) {
    const id = `rf-${randomUUID()}`;
    await db.insert(rideFinancialsTable).values({
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
      calculation_metadata_json: calc.calculationMetadata,
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

  if (existing.locked_at) {
    return { ok: false, error: "snapshot_locked" };
  }
  if (autoLockReason) {
    await db
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
    return { ok: false, error: "snapshot_locked" };
  }

  await db
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
      calculation_metadata_json: calc.calculationMetadata,
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

  const calc = calculateRideFinancialsV1({
    ride: input.ride,
    pricingContext: input.pricingContext ?? null,
    partnerCompanyId: input.ride.companyId ?? null,
    serviceProviderCompanyId: input.ride.companyId ?? null,
  });
  const now = new Date();
  const correctionCount = Number(existing.correction_count ?? 0) + 1;

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
        ...calc.calculationMetadata,
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
