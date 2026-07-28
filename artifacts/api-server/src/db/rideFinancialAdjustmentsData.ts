import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import {
  adminCompaniesTable,
  financialAuditLogTable,
  rideFinancialAdjustmentsTable,
  rideFinancialsTable,
  ridesTable,
} from "./schema";
import { getRideFinancialSnapshotByRideId } from "./rideFinancialsData";
import { companyIsCashCardNettingEligible } from "../lib/cashCardNettingScope";
import { logger } from "../lib/logger";

export type RideFinancialAdjustmentKind =
  | "refund"
  | "chargeback"
  | "manual_credit"
  | "manual_debit"
  | "cancel_fee"
  | "no_show_fee";

export type RideFinancialAdjustmentRow = {
  id: string;
  companyId: string;
  rideId: string;
  kind: RideFinancialAdjustmentKind;
  label: string;
  grossDelta: number;
  commissionDelta: number;
  operatorPayoutDelta: number;
  stripeFeeDelta: number;
  tipDelta: number;
  paymentMethodSnap: string;
  externalRef: string;
  metadata: Record<string, unknown>;
  actorType: string;
  actorId: string | null;
  createdAt: string;
};

function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function mapRideFinancialAdjustmentRow(
  r: typeof rideFinancialAdjustmentsTable.$inferSelect,
): RideFinancialAdjustmentRow {
  return {
    id: r.id,
    companyId: r.company_id,
    rideId: r.ride_id,
    kind: r.kind as RideFinancialAdjustmentKind,
    label: r.label ?? "",
    grossDelta: Number(r.gross_delta) || 0,
    commissionDelta: Number(r.commission_delta) || 0,
    operatorPayoutDelta: Number(r.operator_payout_delta) || 0,
    stripeFeeDelta: Number(r.stripe_fee_delta) || 0,
    tipDelta: Number(r.tip_delta) || 0,
    paymentMethodSnap: r.payment_method_snap ?? "",
    externalRef: r.external_ref ?? "",
    metadata:
      r.metadata_json && typeof r.metadata_json === "object" && !Array.isArray(r.metadata_json)
        ? (r.metadata_json as Record<string, unknown>)
        : {},
    actorType: r.actor_type ?? "system",
    actorId: r.actor_id ?? null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

const KIND_LABELS: Record<RideFinancialAdjustmentKind, string> = {
  refund: "Erstattung (Refund)",
  chargeback: "Chargeback / Streitfall",
  manual_credit: "Manuelle Gutschrift",
  manual_debit: "Manuelle Belastung",
  cancel_fee: "Storno-Gebühr",
  no_show_fee: "No-Show-Gebühr",
};

export function defaultAdjustmentLabel(kind: RideFinancialAdjustmentKind): string {
  return KIND_LABELS[kind] ?? kind;
}

/**
 * Deltas für Refund/Chargeback: Umkehr des Snapshots, anteilig bei Teil-Refund.
 * `refundGrossEur` = erstatteter Bruttobetrag (Kunde); Faktor gegen Snapshot-Brutto.
 */
export function computeRefundReversalDeltas(input: {
  snapshotGross: number;
  snapshotCommission: number;
  snapshotOperatorPayout: number;
  refundGrossEur: number;
}): {
  grossDelta: number;
  commissionDelta: number;
  operatorPayoutDelta: number;
  ratio: number;
} {
  const gross = Math.max(0, Number(input.snapshotGross) || 0);
  const refund = Math.max(0, Number(input.refundGrossEur) || 0);
  const ratio = gross > 0.005 ? Math.min(1, refund / gross) : 1;
  return {
    ratio,
    grossDelta: roundMoney(-gross * ratio),
    commissionDelta: roundMoney(-(Number(input.snapshotCommission) || 0) * ratio),
    operatorPayoutDelta: roundMoney(-(Number(input.snapshotOperatorPayout) || 0) * ratio),
  };
}

export async function findAdjustmentByExternalRef(
  rideId: string,
  kind: RideFinancialAdjustmentKind,
  externalRef: string,
): Promise<RideFinancialAdjustmentRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const ref = externalRef.trim();
  if (!rideId.trim() || !ref) return null;
  const rows = await db
    .select()
    .from(rideFinancialAdjustmentsTable)
    .where(
      and(
        eq(rideFinancialAdjustmentsTable.ride_id, rideId.trim()),
        eq(rideFinancialAdjustmentsTable.kind, kind),
        eq(rideFinancialAdjustmentsTable.external_ref, ref),
      ),
    )
    .limit(1);
  return rows[0] ? mapRideFinancialAdjustmentRow(rows[0]) : null;
}

export async function insertRideFinancialAdjustment(input: {
  companyId: string;
  rideId: string;
  kind: RideFinancialAdjustmentKind;
  label?: string;
  grossDelta?: number;
  commissionDelta?: number;
  operatorPayoutDelta?: number;
  stripeFeeDelta?: number;
  tipDelta?: number;
  paymentMethodSnap?: string;
  externalRef?: string;
  metadata?: Record<string, unknown>;
  actorType?: string;
  actorId?: string | null;
}): Promise<
  | { ok: true; adjustment: RideFinancialAdjustmentRow; idempotent?: boolean }
  | { ok: false; error: string }
> {
  if (!isPostgresConfigured()) return { ok: false, error: "database_not_configured" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };

  const companyId = input.companyId.trim();
  const rideId = input.rideId.trim();
  const externalRef = (input.externalRef ?? "").trim();
  if (!companyId || !rideId) return { ok: false, error: "invalid_input" };

  if (externalRef) {
    const existing = await findAdjustmentByExternalRef(rideId, input.kind, externalRef);
    if (existing) return { ok: true, adjustment: existing, idempotent: true };
  }

  const id = `rfa-${randomUUID().replace(/-/g, "").slice(0, 22)}`;
  const now = new Date();
  const label = (input.label ?? "").trim() || defaultAdjustmentLabel(input.kind);

  try {
    await db.insert(rideFinancialAdjustmentsTable).values({
      id,
      company_id: companyId,
      ride_id: rideId,
      kind: input.kind,
      label,
      gross_delta: roundMoney(input.grossDelta ?? 0),
      commission_delta: roundMoney(input.commissionDelta ?? 0),
      operator_payout_delta: roundMoney(input.operatorPayoutDelta ?? 0),
      stripe_fee_delta: roundMoney(input.stripeFeeDelta ?? 0),
      tip_delta: roundMoney(input.tipDelta ?? 0),
      payment_method_snap: (input.paymentMethodSnap ?? "").trim(),
      external_ref: externalRef,
      metadata_json: input.metadata ?? {},
      actor_type: input.actorType ?? "system",
      actor_id: input.actorId ?? null,
      created_at: now,
    });
  } catch (err) {
    if (externalRef) {
      const raced = await findAdjustmentByExternalRef(rideId, input.kind, externalRef);
      if (raced) return { ok: true, adjustment: raced, idempotent: true };
    }
    logger.warn({ err, rideId, kind: input.kind }, "[finance] insert adjustment failed");
    return { ok: false, error: "insert_failed" };
  }

  const rfPatch: Record<string, unknown> = {
    correction_count: sql`${rideFinancialsTable.correction_count} + 1`,
    last_correction_at: now,
    updated_at: now,
  };
  if (input.kind === "chargeback") {
    rfPatch.settlement_status = "disputed";
  }
  await db.update(rideFinancialsTable).set(rfPatch).where(eq(rideFinancialsTable.ride_id, rideId));

  await db.insert(financialAuditLogTable).values({
    id: `fal-${randomUUID()}`,
    entity_type: "ride_financial_adjustment",
    entity_id: id,
    action: `adjustment_${input.kind}`,
    old_value_json: {},
    new_value_json: {
      rideId,
      kind: input.kind,
      operatorPayoutDelta: roundMoney(input.operatorPayoutDelta ?? 0),
      commissionDelta: roundMoney(input.commissionDelta ?? 0),
      externalRef,
    },
    actor_type: input.actorType ?? "system",
    actor_id: input.actorId ?? null,
  });

  const rows = await db
    .select()
    .from(rideFinancialAdjustmentsTable)
    .where(eq(rideFinancialAdjustmentsTable.id, id))
    .limit(1);
  return rows[0]
    ? { ok: true, adjustment: mapRideFinancialAdjustmentRow(rows[0]) }
    : { ok: false, error: "insert_failed" };
}

async function loadRideCompanyAndPaymentMethod(
  rideId: string,
): Promise<{ companyId: string; paymentMethod: string } | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      companyId: ridesTable.company_id,
      paymentMethod: ridesTable.payment_method,
    })
    .from(ridesTable)
    .where(eq(ridesTable.id, rideId.trim()))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const companyId = (row.companyId ?? "").trim();
  if (!companyId) return null;
  return { companyId, paymentMethod: String(row.paymentMethod ?? "") };
}

/** Refund/Chargeback aus Snapshot ableiten und speichern (idempotent per externalRef). */
export async function recordRidePaymentReversalAdjustment(input: {
  rideId: string;
  kind: "refund" | "chargeback";
  refundGrossEur: number;
  externalRef: string;
  actorType?: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<
  | { ok: true; adjustment: RideFinancialAdjustmentRow; idempotent?: boolean }
  | { ok: false; error: string }
> {
  const ride = await loadRideCompanyAndPaymentMethod(input.rideId);
  if (!ride) return { ok: false, error: "ride_not_found" };

  const snap = await getRideFinancialSnapshotByRideId(input.rideId);
  if (!snap) return { ok: false, error: "snapshot_not_found" };

  const deltas = computeRefundReversalDeltas({
    snapshotGross: snap.grossAmount,
    snapshotCommission: snap.commissionAmount,
    snapshotOperatorPayout: snap.operatorPayoutAmount,
    refundGrossEur: input.refundGrossEur,
  });

  return insertRideFinancialAdjustment({
    companyId: ride.companyId,
    rideId: input.rideId,
    kind: input.kind,
    label: defaultAdjustmentLabel(input.kind),
    grossDelta: deltas.grossDelta,
    commissionDelta: deltas.commissionDelta,
    operatorPayoutDelta: deltas.operatorPayoutDelta,
    paymentMethodSnap: ride.paymentMethod,
    externalRef: input.externalRef,
    actorType: input.actorType,
    actorId: input.actorId,
    metadata: {
      ...(input.metadata ?? {}),
      refundGrossEur: input.refundGrossEur,
      ratio: deltas.ratio,
      snapshotGross: snap.grossAmount,
      snapshotCommission: snap.commissionAmount,
      snapshotOperatorPayout: snap.operatorPayoutAmount,
    },
  });
}

export async function sumAdjustmentsForCompany(
  companyId: string,
  createdAtFilter?: SQL,
): Promise<{
  grossDelta: number;
  commissionDelta: number;
  operatorPayoutDelta: number;
  tipDelta: number;
  stripeFeeDelta: number;
  count: number;
}> {
  const empty = {
    grossDelta: 0,
    commissionDelta: 0,
    operatorPayoutDelta: 0,
    tipDelta: 0,
    stripeFeeDelta: 0,
    count: 0,
  };
  if (!isPostgresConfigured()) return empty;
  const db = getDb();
  if (!db) return empty;

  const conditions: SQL[] = [eq(rideFinancialAdjustmentsTable.company_id, companyId.trim())];
  if (createdAtFilter) conditions.push(createdAtFilter);

  const [row] = await db
    .select({
      grossDelta: sql<string>`coalesce(sum(${rideFinancialAdjustmentsTable.gross_delta}), 0)`,
      commissionDelta: sql<string>`coalesce(sum(${rideFinancialAdjustmentsTable.commission_delta}), 0)`,
      operatorPayoutDelta: sql<string>`coalesce(sum(${rideFinancialAdjustmentsTable.operator_payout_delta}), 0)`,
      tipDelta: sql<string>`coalesce(sum(${rideFinancialAdjustmentsTable.tip_delta}), 0)`,
      stripeFeeDelta: sql<string>`coalesce(sum(${rideFinancialAdjustmentsTable.stripe_fee_delta}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(rideFinancialAdjustmentsTable)
    .where(and(...conditions));

  return {
    grossDelta: Number(row?.grossDelta ?? 0),
    commissionDelta: Number(row?.commissionDelta ?? 0),
    operatorPayoutDelta: Number(row?.operatorPayoutDelta ?? 0),
    tipDelta: Number(row?.tipDelta ?? 0),
    stripeFeeDelta: Number(row?.stripeFeeDelta ?? 0),
    count: Number(row?.count ?? 0),
  };
}

export async function listAdjustmentsForCompany(
  companyId: string,
  opts?: { createdAtFrom?: Date; createdAtTo?: Date; limit?: number },
): Promise<RideFinancialAdjustmentRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const conditions: SQL[] = [eq(rideFinancialAdjustmentsTable.company_id, companyId.trim())];
  if (opts?.createdAtFrom) conditions.push(gte(rideFinancialAdjustmentsTable.created_at, opts.createdAtFrom));
  if (opts?.createdAtTo) conditions.push(lte(rideFinancialAdjustmentsTable.created_at, opts.createdAtTo));

  const rows = await db
    .select()
    .from(rideFinancialAdjustmentsTable)
    .where(and(...conditions))
    .orderBy(desc(rideFinancialAdjustmentsTable.created_at))
    .limit(Math.min(Math.max(opts?.limit ?? 200, 1), 500));

  return rows.map(mapRideFinancialAdjustmentRow);
}

export async function listAdjustmentsForRideIds(rideIds: string[]): Promise<RideFinancialAdjustmentRow[]> {
  if (!isPostgresConfigured() || rideIds.length === 0) return [];
  const db = getDb();
  if (!db) return [];
  const ids = [...new Set(rideIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(rideFinancialAdjustmentsTable)
    .where(inArray(rideFinancialAdjustmentsTable.ride_id, ids))
    .orderBy(desc(rideFinancialAdjustmentsTable.created_at));
  return rows.map(mapRideFinancialAdjustmentRow);
}

export type RideFinancialAdjustmentAdminRow = RideFinancialAdjustmentRow & {
  companyName: string | null;
};

/** Manuelle Gutschrift/Belastung am Unternehmer-Saldo (Taxi-Netting). Beträge positiv eingeben; Vorzeichen folgt kind. */
export async function recordManualRideFinancialAdjustment(input: {
  rideId: string;
  kind: "manual_credit" | "manual_debit";
  /** Positiver Euro-Betrag für Unternehmer-Anteil-Delta. */
  operatorPayoutAmountEur: number;
  commissionAmountEur?: number;
  grossAmountEur?: number;
  label?: string;
  note?: string;
  actorType?: string;
  actorId?: string | null;
}): Promise<
  | { ok: true; adjustment: RideFinancialAdjustmentRow }
  | { ok: false; error: string }
> {
  const rideId = input.rideId.trim();
  if (!rideId) return { ok: false, error: "ride_id_required" };

  const ride = await loadRideCompanyAndPaymentMethod(rideId);
  if (!ride) return { ok: false, error: "ride_not_found" };

  const taxiOk = await companyIsCashCardNettingEligible(ride.companyId);
  if (!taxiOk) return { ok: false, error: "taxi_only" };

  const snap = await getRideFinancialSnapshotByRideId(rideId);
  if (!snap) return { ok: false, error: "snapshot_not_found" };

  const opAbs = Math.abs(Number(input.operatorPayoutAmountEur) || 0);
  if (!(opAbs > 0.004)) return { ok: false, error: "invalid_operator_payout_amount" };

  const commissionAbs = Math.abs(Number(input.commissionAmountEur) || 0);
  const grossAbs = Math.abs(Number(input.grossAmountEur) || 0);
  const sign = input.kind === "manual_credit" ? 1 : -1;

  const note = (input.note ?? "").trim();
  const label =
    (input.label ?? "").trim() ||
    `${defaultAdjustmentLabel(input.kind)}${note ? `: ${note.slice(0, 80)}` : ""}`;

  return insertRideFinancialAdjustment({
    companyId: ride.companyId,
    rideId,
    kind: input.kind,
    label,
    operatorPayoutDelta: roundMoney(sign * opAbs),
    commissionDelta: roundMoney(sign * commissionAbs),
    grossDelta: roundMoney(sign * grossAbs),
    paymentMethodSnap: ride.paymentMethod,
    actorType: input.actorType ?? "admin",
    actorId: input.actorId ?? null,
    metadata: {
      source: "admin_manual",
      note: note || undefined,
      operatorPayoutAmountEur: opAbs,
      commissionAmountEur: commissionAbs || undefined,
      grossAmountEur: grossAbs || undefined,
    },
  });
}

export async function listRideFinancialAdjustmentsAdmin(args: {
  companyId?: string;
  rideId?: string;
  kind?: string;
  limit?: number;
  offset?: number;
}): Promise<{ total: number; items: RideFinancialAdjustmentAdminRow[] }> {
  if (!isPostgresConfigured()) return { total: 0, items: [] };
  const db = getDb();
  if (!db) return { total: 0, items: [] };

  const conditions: SQL[] = [];
  const companyId = (args.companyId ?? "").trim();
  const rideId = (args.rideId ?? "").trim();
  const kind = (args.kind ?? "").trim();
  if (companyId) conditions.push(eq(rideFinancialAdjustmentsTable.company_id, companyId));
  if (rideId) conditions.push(eq(rideFinancialAdjustmentsTable.ride_id, rideId));
  if (kind) conditions.push(eq(rideFinancialAdjustmentsTable.kind, kind));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const offset = Math.max(args.offset ?? 0, 0);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(rideFinancialAdjustmentsTable)
    .where(where);

  const rows = await db
    .select({
      adj: rideFinancialAdjustmentsTable,
      companyName: adminCompaniesTable.name,
    })
    .from(rideFinancialAdjustmentsTable)
    .leftJoin(adminCompaniesTable, eq(adminCompaniesTable.id, rideFinancialAdjustmentsTable.company_id))
    .where(where)
    .orderBy(desc(rideFinancialAdjustmentsTable.created_at))
    .limit(limit)
    .offset(offset);

  return {
    total: Number(countRow?.total ?? 0),
    items: rows.map((r) => ({
      ...mapRideFinancialAdjustmentRow(r.adj),
      companyName: r.companyName?.trim() ? r.companyName.trim() : null,
    })),
  };
}

export async function findRideIdByStripePaymentIntentId(paymentIntentId: string): Promise<string | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const pi = paymentIntentId.trim();
  if (!pi) return null;
  const rows = await db
    .select({ id: ridesTable.id })
    .from(ridesTable)
    .where(eq(ridesTable.stripe_payment_intent_id, pi))
    .limit(1);
  return rows[0]?.id ?? null;
}
