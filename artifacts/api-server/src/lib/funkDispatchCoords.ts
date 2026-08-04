/**
 * Pure helpers for Funk-Create coord handling (also used by selftest).
 * NaN must not skip geocoding — `NaN ?? null` stays NaN and breaks candidate ranking.
 */
export function finiteCoordOrNull(v: unknown): number | null {
  if (typeof v !== "number") return null;
  return Number.isFinite(v) ? v : null;
}

export function funkRideRequiresCoords(ride: {
  fromLat?: number | null;
  fromLon?: number | null;
}): boolean {
  return finiteCoordOrNull(ride.fromLat) != null && finiteCoordOrNull(ride.fromLon) != null;
}

/** Fleet-Owner, der den Funk-Auftrag aus der App angelegt hat. */
export function funkCreatorFleetDriverId(ride: {
  partnerBookingMeta?: unknown;
}): string | null {
  const meta = ride.partnerBookingMeta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const raw = (meta as Record<string, unknown>).fleet_driver_id;
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id.length > 0 ? id : null;
}
