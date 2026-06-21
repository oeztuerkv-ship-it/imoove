import { eq } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { isGpsOutlierJump } from "../lib/gpsOutlierFilter";
import {
  appendRideLocationHistory,
  RIDE_GPS_HISTORY_STATUSES,
} from "./rideLocationHistoryData";
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

/** Letzte Position + optional Ping-Historie während aktiver Fahrt. */
export async function persistDriverLocationPing(input: {
  rideId: string;
  fleetDriverId: string;
  lat: number;
  lon: number;
  rideStatus: string;
}): Promise<RideDriverLocationSnapshot | null> {
  const status = input.rideStatus.trim();
  const snapshot = await upsertRideDriverLocation(
    input.rideId,
    input.fleetDriverId,
    input.lat,
    input.lon,
  );
  if (snapshot && RIDE_GPS_HISTORY_STATUSES.has(status)) {
    await appendRideLocationHistory(
      input.rideId,
      input.fleetDriverId,
      snapshot.lat,
      snapshot.lon,
      new Date(snapshot.updatedAt),
    );
  }
  return snapshot;
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
  const snap = await getRideDriverLocation(rideId);
  if (snap) cache.set(rideId, { lat: snap.lat, lon: snap.lon, updatedAt: snap.updatedAt });
}
