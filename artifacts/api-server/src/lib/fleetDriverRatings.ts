import { and, eq, sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "../db/client";
import { findRide, findRideForPassenger } from "../db/ridesData";
import { fleetDriversTable, passengerProfilesTable, ridesTable } from "../db/schema";

export function averageFleetDriverRating(sum: number, count: number): number | null {
  if (!Number.isFinite(sum) || !Number.isFinite(count) || count <= 0) return null;
  return Math.round((sum / count) * 10) / 10;
}

export async function getFleetDriverRatingAverage(
  fleetDriverId: string,
  companyId: string,
): Promise<number | null> {
  const driverId = fleetDriverId.trim();
  const cid = companyId.trim();
  if (!driverId || !cid || !isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      rating_sum: fleetDriversTable.rating_sum,
      rating_count: fleetDriversTable.rating_count,
    })
    .from(fleetDriversTable)
    .where(and(eq(fleetDriversTable.id, driverId), eq(fleetDriversTable.company_id, cid)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return averageFleetDriverRating(Number(row.rating_sum) || 0, Number(row.rating_count) || 0);
}

export async function submitPassengerDriverRating(input: {
  rideId: string;
  passengerId: string;
  stars: number;
}): Promise<
  | { ok: true; rating: number; driverRatingAverage: number | null }
  | { ok: false; error: string; status: number }
> {
  const rideId = input.rideId.trim();
  const passengerId = input.passengerId.trim();
  const stars = Math.round(input.stars);
  if (!rideId || !passengerId) {
    return { ok: false, error: "ride_id_required", status: 400 };
  }
  if (stars < 1 || stars > 5) {
    return { ok: false, error: "invalid_rating", status: 400 };
  }
  if (!isPostgresConfigured()) {
    return { ok: false, error: "database_not_configured", status: 503 };
  }
  const ride = await findRideForPassenger(rideId, passengerId);
  if (!ride) {
    return { ok: false, error: "not_found", status: 404 };
  }
  if (ride.status !== "completed") {
    return { ok: false, error: "ride_not_completed", status: 409 };
  }
  const driverId = (ride.driverId ?? "").trim();
  const companyId = (ride.companyId ?? "").trim();
  if (!driverId || !companyId) {
    return { ok: false, error: "no_driver_assigned", status: 409 };
  }
  const db = getDb();
  if (!db) {
    return { ok: false, error: "database_not_configured", status: 503 };
  }
  const existing = await findRide(rideId);
  if (existing?.passengerRating != null) {
    const avg = await getFleetDriverRatingAverage(driverId, companyId);
    return { ok: true, rating: existing.passengerRating, driverRatingAverage: avg };
  }
  const updatedRide = await db
    .update(ridesTable)
    .set({ passenger_rating: stars })
    .where(and(eq(ridesTable.id, rideId), sql`${ridesTable.passenger_rating} IS NULL`))
    .returning({ id: ridesTable.id });
  if (!updatedRide[0]) {
    const cur = await findRide(rideId);
    const avg = await getFleetDriverRatingAverage(driverId, companyId);
    return {
      ok: true,
      rating: cur?.passengerRating ?? stars,
      driverRatingAverage: avg,
    };
  }
  await db
    .update(fleetDriversTable)
    .set({
      rating_sum: sql`${fleetDriversTable.rating_sum} + ${stars}`,
      rating_count: sql`${fleetDriversTable.rating_count} + 1`,
      updated_at: new Date(),
    })
    .where(and(eq(fleetDriversTable.id, driverId), eq(fleetDriversTable.company_id, companyId)));
  const avg = await getFleetDriverRatingAverage(driverId, companyId);
  return { ok: true, rating: stars, driverRatingAverage: avg };
}

export function averagePassengerRatingFromDrivers(sum: number, count: number): number | null {
  if (!Number.isFinite(sum) || !Number.isFinite(count) || count <= 0) return null;
  return Math.round((sum / count) * 10) / 10;
}

export async function submitDriverPassengerRating(input: {
  rideId: string;
  fleetDriverId: string;
  companyId: string;
  stars: number;
}): Promise<
  | { ok: true; rating: number; passengerRatingAverage: number | null }
  | { ok: false; error: string; status: number }
> {
  const rideId = input.rideId.trim();
  const fleetDriverId = input.fleetDriverId.trim();
  const companyId = input.companyId.trim();
  const stars = Math.round(input.stars);
  if (!rideId || !fleetDriverId || !companyId) {
    return { ok: false, error: "ride_id_required", status: 400 };
  }
  if (stars < 1 || stars > 5) {
    return { ok: false, error: "invalid_rating", status: 400 };
  }
  if (!isPostgresConfigured()) {
    return { ok: false, error: "database_not_configured", status: 503 };
  }
  const ride = await findRide(rideId);
  if (!ride) {
    return { ok: false, error: "not_found", status: 404 };
  }
  if ((ride.driverId ?? "").trim() !== fleetDriverId || (ride.companyId ?? "").trim() !== companyId) {
    return { ok: false, error: "forbidden", status: 403 };
  }
  if (ride.status !== "completed") {
    return { ok: false, error: "ride_not_completed", status: 409 };
  }
  const passengerId = (ride.passengerId ?? "").trim();
  if (!passengerId) {
    return { ok: false, error: "no_passenger", status: 409 };
  }
  const db = getDb();
  if (!db) {
    return { ok: false, error: "database_not_configured", status: 503 };
  }
  if (ride.driverPassengerRating != null) {
    const rows = await db
      .select({
        rating_sum: passengerProfilesTable.rating_sum,
        rating_count: passengerProfilesTable.rating_count,
      })
      .from(passengerProfilesTable)
      .where(eq(passengerProfilesTable.passenger_id, passengerId))
      .limit(1);
    const row = rows[0];
    const avg = row
      ? averagePassengerRatingFromDrivers(Number(row.rating_sum) || 0, Number(row.rating_count) || 0)
      : null;
    return { ok: true, rating: ride.driverPassengerRating, passengerRatingAverage: avg };
  }
  const updatedRide = await db
    .update(ridesTable)
    .set({ driver_passenger_rating: stars })
    .where(and(eq(ridesTable.id, rideId), sql`${ridesTable.driver_passenger_rating} IS NULL`))
    .returning({ id: ridesTable.id });
  if (!updatedRide[0]) {
    const cur = await findRide(rideId);
    const rows = await db
      .select({
        rating_sum: passengerProfilesTable.rating_sum,
        rating_count: passengerProfilesTable.rating_count,
      })
      .from(passengerProfilesTable)
      .where(eq(passengerProfilesTable.passenger_id, passengerId))
      .limit(1);
    const row = rows[0];
    const avg = row
      ? averagePassengerRatingFromDrivers(Number(row.rating_sum) || 0, Number(row.rating_count) || 0)
      : null;
    return {
      ok: true,
      rating: cur?.driverPassengerRating ?? stars,
      passengerRatingAverage: avg,
    };
  }
  await db
    .insert(passengerProfilesTable)
    .values({
      passenger_id: passengerId,
      name: ride.customerName ?? "",
      rating_sum: stars,
      rating_count: 1,
      updated_at: new Date(),
      last_seen_at: new Date(),
    })
    .onConflictDoUpdate({
      target: passengerProfilesTable.passenger_id,
      set: {
        rating_sum: sql`${passengerProfilesTable.rating_sum} + ${stars}`,
        rating_count: sql`${passengerProfilesTable.rating_count} + 1`,
        updated_at: new Date(),
      },
    });
  const rows = await db
    .select({
      rating_sum: passengerProfilesTable.rating_sum,
      rating_count: passengerProfilesTable.rating_count,
    })
    .from(passengerProfilesTable)
    .where(eq(passengerProfilesTable.passenger_id, passengerId))
    .limit(1);
  const row = rows[0];
  const avg = row
    ? averagePassengerRatingFromDrivers(Number(row.rating_sum) || 0, Number(row.rating_count) || 0)
    : null;
  return { ok: true, rating: stars, passengerRatingAverage: avg };
}
