import { desc, eq } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import {
  DEFAULT_PAYER_KIND,
  DEFAULT_RIDE_KIND,
  isPayerKind,
  isRideKind,
  payerKindForAccessCodeRide,
} from "../domain/rideBillingProfile";
import {
  DEFAULT_AUTHORIZATION_SOURCE,
  isAuthorizationSource,
  normalizeAccessCodeInput,
} from "../domain/rideAuthorization";
import { redeemAccessCodeInTransaction, redeemAccessCodeMemory } from "./accessCodesData";
import { getDb } from "./client";
import { ridesTable } from "./schema";

/** In-Memory-Fallback wenn kein DATABASE_URL (lokal / ohne Postgres). */
let memoryRides: RideRequest[] = [];

function stripEphemeral(r: RideRequest): RideRequest {
  const { accessCodeSummary: _a, ...rest } = r;
  return rest;
}

function rowToRide(r: typeof ridesTable.$inferSelect): RideRequest {
  const rk = r.ride_kind;
  const pk = r.payer_kind;
  const auth = r.authorization_source;
  return {
    id: r.id,
    companyId: r.company_id ?? null,
    createdByPanelUserId: r.created_by_panel_user_id ?? null,
    rideKind: typeof rk === "string" && isRideKind(rk) ? rk : DEFAULT_RIDE_KIND,
    payerKind: typeof pk === "string" && isPayerKind(pk) ? pk : DEFAULT_PAYER_KIND,
    voucherCode: r.voucher_code ?? null,
    billingReference: r.billing_reference ?? null,
    authorizationSource:
      typeof auth === "string" && isAuthorizationSource(auth) ? auth : DEFAULT_AUTHORIZATION_SOURCE,
    accessCodeId: r.access_code_id ?? null,
    accessCodeNormalizedSnapshot: r.access_code_normalized_snapshot ?? null,
    createdAt: new Date(r.created_at).toISOString(),
    scheduledAt: r.scheduled_at ? new Date(r.scheduled_at).toISOString() : null,
    status: r.status as RideRequest["status"],
    customerName: r.customer_name,
    passengerId: r.passenger_id ?? undefined,
    driverId: r.driver_id,
    from: r.from_label,
    fromFull: r.from_full,
    fromLat: r.from_lat ?? undefined,
    fromLon: r.from_lon ?? undefined,
    to: r.to_label,
    toFull: r.to_full,
    toLat: r.to_lat ?? undefined,
    toLon: r.to_lon ?? undefined,
    distanceKm: r.distance_km,
    durationMinutes: r.duration_minutes,
    estimatedFare: r.estimated_fare,
    finalFare: r.final_fare ?? null,
    paymentMethod: r.payment_method,
    vehicle: r.vehicle,
    rejectedBy: Array.isArray(r.rejected_by) ? r.rejected_by : [],
  };
}

function rideToUpdate(r: RideRequest) {
  return {
    company_id: r.companyId ?? null,
    created_by_panel_user_id: r.createdByPanelUserId ?? null,
    ride_kind: r.rideKind,
    payer_kind: r.payerKind,
    voucher_code: r.voucherCode ?? null,
    billing_reference: r.billingReference ?? null,
    authorization_source: r.authorizationSource,
    access_code_id: r.accessCodeId ?? null,
    access_code_normalized_snapshot: r.accessCodeNormalizedSnapshot ?? null,
    scheduled_at: r.scheduledAt ? new Date(r.scheduledAt) : null,
    status: r.status,
    customer_name: r.customerName,
    passenger_id: r.passengerId ?? null,
    driver_id: r.driverId ?? null,
    from_label: r.from,
    from_full: r.fromFull,
    from_lat: r.fromLat ?? null,
    from_lon: r.fromLon ?? null,
    to_label: r.to,
    to_full: r.toFull,
    to_lat: r.toLat ?? null,
    to_lon: r.toLon ?? null,
    distance_km: r.distanceKm,
    duration_minutes: r.durationMinutes,
    estimated_fare: r.estimatedFare,
    final_fare: r.finalFare ?? null,
    payment_method: r.paymentMethod,
    vehicle: r.vehicle,
    rejected_by: r.rejectedBy,
  };
}

function rideToInsert(r: RideRequest): typeof ridesTable.$inferInsert {
  return {
    id: r.id,
    company_id: r.companyId ?? null,
    created_by_panel_user_id: r.createdByPanelUserId ?? null,
    ride_kind: r.rideKind,
    payer_kind: r.payerKind,
    voucher_code: r.voucherCode ?? null,
    billing_reference: r.billingReference ?? null,
    authorization_source: r.authorizationSource,
    access_code_id: r.accessCodeId ?? null,
    access_code_normalized_snapshot: r.accessCodeNormalizedSnapshot ?? null,
    created_at: new Date(r.createdAt),
    scheduled_at: r.scheduledAt ? new Date(r.scheduledAt) : null,
    status: r.status,
    customer_name: r.customerName,
    passenger_id: r.passengerId ?? null,
    driver_id: r.driverId ?? null,
    from_label: r.from,
    from_full: r.fromFull,
    from_lat: r.fromLat ?? null,
    from_lon: r.fromLon ?? null,
    to_label: r.to,
    to_full: r.toFull,
    to_lat: r.toLat ?? null,
    to_lon: r.toLon ?? null,
    distance_km: r.distanceKm,
    duration_minutes: r.durationMinutes,
    estimated_fare: r.estimatedFare,
    final_fare: r.finalFare ?? null,
    payment_method: r.paymentMethod,
    vehicle: r.vehicle,
    rejected_by: r.rejectedBy,
  };
}

export async function listRides(): Promise<RideRequest[]> {
  const db = getDb();
  if (!db) {
    return [...memoryRides];
  }
  const rows = await db.select().from(ridesTable).orderBy(desc(ridesTable.created_at));
  return rows.map(rowToRide);
}

/** Nur Fahrten mit gesetzter company_id = Mandant (Partner-Panel-Scope). */
export async function listRidesForCompany(companyId: string): Promise<RideRequest[]> {
  const db = getDb();
  if (!db) {
    return memoryRides
      .filter((r) => r.companyId === companyId)
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  const rows = await db
    .select()
    .from(ridesTable)
    .where(eq(ridesTable.company_id, companyId))
    .orderBy(desc(ridesTable.created_at));
  return rows.map(rowToRide);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function insertRide(r: RideRequest, tx?: any): Promise<void> {
  const persisted = stripEphemeral(r);
  const db = getDb();
  const run = tx ?? db;
  if (!run) {
    memoryRides = [persisted, ...memoryRides];
    return;
  }
  await run.insert(ridesTable).values(rideToInsert(persisted));
}

/**
 * Buchung mit optionalem Zugangscode: atomare Einlösung (Postgres) bzw. In-Memory.
 * Ohne Code: `passenger_direct`, kein `access_code_id`.
 * Mit Code: digitale Kostenübernahme — `payerKind` wird auf `company` gesetzt, wenn ein `companyId` ermittelbar ist.
 */
export async function insertRideWithOptionalAccessCode(
  ride: RideRequest,
  accessCodePlain: string | undefined | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = typeof accessCodePlain === "string" ? accessCodePlain.trim() : "";
  if (!trimmed) {
    const r: RideRequest = {
      ...stripEphemeral(ride),
      authorizationSource: DEFAULT_AUTHORIZATION_SOURCE,
      accessCodeId: null,
      accessCodeNormalizedSnapshot: null,
    };
    await insertRide(r);
    return { ok: true };
  }

  const normalized = normalizeAccessCodeInput(trimmed);
  if (!normalized) return { ok: false, error: "access_code_invalid" };

  const bookingCompanyId = ride.companyId ?? null;
  const db = getDb();
  if (!db) {
    const red = redeemAccessCodeMemory(trimmed, bookingCompanyId);
    if (!red.ok) return { ok: false, error: red.error };
    const resolvedCompanyId = ride.companyId ?? red.companyIdOnCode ?? null;
    const r: RideRequest = {
      ...stripEphemeral(ride),
      authorizationSource: "access_code",
      accessCodeId: red.id,
      accessCodeNormalizedSnapshot: normalized,
      companyId: resolvedCompanyId,
      payerKind: payerKindForAccessCodeRide(resolvedCompanyId),
    };
    await insertRide(r);
    return { ok: true };
  }

  try {
    const out = await db.transaction(async (trx) => {
      const red = await redeemAccessCodeInTransaction(trx, normalized, bookingCompanyId);
      if (!red.ok) return { ok: false as const, error: red.error };
      const resolvedCompanyId = ride.companyId ?? red.companyIdOnCode ?? null;
      const r: RideRequest = {
        ...stripEphemeral(ride),
        authorizationSource: "access_code",
        accessCodeId: red.id,
        accessCodeNormalizedSnapshot: normalized,
        companyId: resolvedCompanyId,
        payerKind: payerKindForAccessCodeRide(resolvedCompanyId),
      };
      await insertRide(r, trx);
      return { ok: true as const };
    });
    if (!out.ok) return { ok: false, error: out.error };
    return { ok: true };
  } catch {
    return { ok: false, error: "access_code_invalid" };
  }
}

export async function findRide(id: string): Promise<RideRequest | null> {
  const db = getDb();
  if (!db) {
    return memoryRides.find((x) => x.id === id) ?? null;
  }
  const rows = await db.select().from(ridesTable).where(eq(ridesTable.id, id)).limit(1);
  return rows[0] ? rowToRide(rows[0]) : null;
}

export async function updateRide(id: string, patch: Partial<RideRequest>): Promise<RideRequest | null> {
  const cur = await findRide(id);
  if (!cur) return null;
  const next: RideRequest = { ...cur, ...patch };
  const db = getDb();
  if (!db) {
    memoryRides = memoryRides.map((x) => (x.id === id ? next : x));
    return next;
  }
  await db.update(ridesTable).set(rideToUpdate(next)).where(eq(ridesTable.id, id));
  return next;
}

export async function adminReleaseRide(id: string): Promise<RideRequest | null> {
  const cur = await findRide(id);
  if (!cur) return null;
  return updateRide(id, { driverId: null, status: "pending" });
}

export async function resetRidesDemo(seed: RideRequest[]): Promise<void> {
  const db = getDb();
  if (!db) {
    memoryRides = [...seed];
    return;
  }
  await db.delete(ridesTable);
  if (seed.length > 0) {
    await db.insert(ridesTable).values(seed.map(rideToInsert));
  }
}
