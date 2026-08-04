/**
 * Owner Live-Flotte: online Fahrer der eigenen Firma inkl. Market-GPS.
 * Gleiche Frische wie Funk-Dispatch — kein neues Schema.
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { FUNK_GPS_FRESH_MS } from "./funkDispatchData";
import { getDb, isPostgresConfigured } from "./client";
import { fleetDriversTable } from "./schema";

export { FUNK_GPS_FRESH_MS as FLEET_LIVE_GPS_FRESH_MS };

export type FleetLiveDriver = {
  id: string;
  lat: number;
  lon: number;
  updatedAt: string;
};

/** Rein: GPS-Zeitstempel frisch genug für Live-Anzeige. */
export function isFleetLiveGpsFresh(
  atMs: number,
  nowMs: number,
  freshMs: number = FUNK_GPS_FRESH_MS,
): boolean {
  return Number.isFinite(atMs) && Number.isFinite(nowMs) && nowMs - atMs <= freshMs;
}

/**
 * ONLINE + aktiv + freigegeben + GPS vorhanden + frisch (wie Funk-Kandidaten-Basis,
 * ohne Busy/Capability/Pickup-Distanz).
 */
export async function listFleetLiveDriversForCompany(
  companyId: string,
  nowMs: number = Date.now(),
): Promise<FleetLiveDriver[]> {
  const co = companyId.trim();
  if (!co || !isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: fleetDriversTable.id,
      lat: fleetDriversTable.last_market_lat,
      lon: fleetDriversTable.last_market_lon,
      at: fleetDriversTable.last_market_at,
    })
    .from(fleetDriversTable)
    .where(
      and(
        eq(fleetDriversTable.company_id, co),
        eq(fleetDriversTable.is_market_online, true),
        eq(fleetDriversTable.is_active, true),
        eq(fleetDriversTable.access_status, "active"),
        eq(fleetDriversTable.approval_status, "approved"),
        isNotNull(fleetDriversTable.last_market_lat),
        isNotNull(fleetDriversTable.last_market_lon),
      ),
    );

  const out: FleetLiveDriver[] = [];
  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    const lat = row.lat;
    const lon = row.lon;
    if (!id || lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const atMs = row.at ? new Date(row.at).getTime() : NaN;
    if (!isFleetLiveGpsFresh(atMs, nowMs)) continue;
    out.push({
      id,
      lat,
      lon,
      updatedAt: new Date(atMs).toISOString(),
    });
  }
  return out;
}
