import { eq } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { isGpsOutlierJump } from "../lib/gpsOutlierFilter";
import { rideDriverLocationsTable } from "./schema";

export type RideDriverLocationSnapshot = {
  lat: number;
  lon: number;
  updatedAt: string;
  fleetDriverId?: string;
};

export async function upsertRideDriverLocation(
  rideId: string,
  fleetDriverId: string,
  lat: number,
  lon: number,
): Promise<RideDriverLocationSnapshot | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rid = rideId.trim();
  const did = fleetDriverId.trim();
  if (!rid || !did || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const prev = await getRideDriverLocation(rideId);
  if (prev && isGpsOutlierJump(prev.lat, prev.lon, lat, lon)) {
    return prev;
  }

  const now = new Date();
  await db
    .insert(rideDriverLocationsTable)
    .values({
      ride_id: rid,
      fleet_driver_id: did,
      lat,
      lon,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: rideDriverLocationsTable.ride_id,
      set: { fleet_driver_id: did, lat, lon, updated_at: now },
    });
  return { lat, lon, updatedAt: now.toISOString(), fleetDriverId: did };
}

export async function getRideDriverLocation(rideId: string): Promise<RideDriverLocationSnapshot | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rid = rideId.trim();
  if (!rid) return null;
  const rows = await db
    .select({
      lat: rideDriverLocationsTable.lat,
      lon: rideDriverLocationsTable.lon,
      updated_at: rideDriverLocationsTable.updated_at,
      fleet_driver_id: rideDriverLocationsTable.fleet_driver_id,
    })
    .from(rideDriverLocationsTable)
    .where(eq(rideDriverLocationsTable.ride_id, rid))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const lat = Number(row.lat);
  const lon = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    lat,
    lon,
    updatedAt: row.updated_at.toISOString(),
    fleetDriverId: row.fleet_driver_id,
  };
}

/** In-Memory-Cache aus DB nach API-Neustart / vor Geofence-Guard füllen. */
export async function hydrateRideDriverLocationCache(
  rideId: string,
  cache: Map<string, RideDriverLocationSnapshot>,
): Promise<void> {
  if (cache.has(rideId)) return;
  const dbLoc = await getRideDriverLocation(rideId);
  if (dbLoc) cache.set(rideId, dbLoc);
}
