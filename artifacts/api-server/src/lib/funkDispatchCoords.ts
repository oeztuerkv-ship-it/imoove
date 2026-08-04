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
