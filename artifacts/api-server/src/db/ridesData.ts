import { desc, eq } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import { getDb, isPostgresConfigured } from "./client";
import { ridesTable } from "./schema";

/** In-Memory-Fallback wenn kein DATABASE_URL (lokal / ohne Postgres). */
let memoryRides: RideRequest[] = [];

function rowToRide(r: typeof ridesTable.$inferSelect): RideRequest {
  return {
    id: r.id,
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

export async function insertRide(r: RideRequest): Promise<void> {
  const db = getDb();
  if (!db) {
    memoryRides = [r, ...memoryRides];
    return;
  }
  await db.insert(ridesTable).values(rideToInsert(r));
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
