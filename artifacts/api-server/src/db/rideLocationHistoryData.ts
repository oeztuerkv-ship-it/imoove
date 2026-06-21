import { and, asc, eq, gte, lt } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { rideLocationHistoryTable } from "./schema";

export type RideLocationHistoryPoint = {
  lat: number;
  lon: number;
  recordedAt: Date;
  fleetDriverId: string;
};

/** Status, in denen Fahrer-GPS-Pings in der Historie mitgespeichert werden. */
export const RIDE_GPS_HISTORY_STATUSES = new Set([
  "accepted",
  "driver_arriving",
  "driver_waiting",
  "arrived",
  "passenger_onboard",
  "in_progress",
]);

export async function appendRideLocationHistory(
  rideId: string,
  fleetDriverId: string,
  lat: number,
  lon: number,
  recordedAt: Date = new Date(),
): Promise<void> {
  if (!isPostgresConfigured()) return;
  const db = getDb();
  if (!db) return;
  const rid = rideId.trim();
  const did = fleetDriverId.trim();
  if (!rid || !did || !Number.isFinite(lat) || !Number.isFinite(lon)) return;

  await db.insert(rideLocationHistoryTable).values({
    ride_id: rid,
    fleet_driver_id: did,
    lat,
    lon,
    recorded_at: recordedAt,
  });
}

export async function listRideLocationHistory(
  rideId: string,
  opts?: { from?: Date; to?: Date },
): Promise<RideLocationHistoryPoint[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const rid = rideId.trim();
  if (!rid) return [];

  const filters = [eq(rideLocationHistoryTable.ride_id, rid)];
  if (opts?.from instanceof Date && !Number.isNaN(opts.from.getTime())) {
    filters.push(gte(rideLocationHistoryTable.recorded_at, opts.from));
  }
  if (opts?.to instanceof Date && !Number.isNaN(opts.to.getTime())) {
    filters.push(lt(rideLocationHistoryTable.recorded_at, opts.to));
  }

  const rows = await db
    .select({
      lat: rideLocationHistoryTable.lat,
      lon: rideLocationHistoryTable.lon,
      recordedAt: rideLocationHistoryTable.recorded_at,
      fleetDriverId: rideLocationHistoryTable.fleet_driver_id,
    })
    .from(rideLocationHistoryTable)
    .where(and(...filters))
    .orderBy(asc(rideLocationHistoryTable.recorded_at));

  return rows
    .map((row) => {
      const lat = Number(row.lat);
      const lon = Number(row.lon);
      const recordedAt = row.recordedAt instanceof Date ? row.recordedAt : new Date(row.recordedAt);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Number.isNaN(recordedAt.getTime())) return null;
      return {
        lat,
        lon,
        recordedAt,
        fleetDriverId: row.fleetDriverId,
      };
    })
    .filter((p): p is RideLocationHistoryPoint => p != null);
}

/** Roh-Pings älter als cutoff löschen (Retention, z. B. 90 Tage). */
export async function purgeRideLocationHistoryOlderThan(cutoff: Date): Promise<number> {
  if (!isPostgresConfigured()) return 0;
  const db = getDb();
  if (!db) return 0;
  if (!(cutoff instanceof Date) || Number.isNaN(cutoff.getTime())) return 0;

  const deleted = await db
    .delete(rideLocationHistoryTable)
    .where(lt(rideLocationHistoryTable.recorded_at, cutoff))
    .returning({ id: rideLocationHistoryTable.id });

  return deleted.length;
}
