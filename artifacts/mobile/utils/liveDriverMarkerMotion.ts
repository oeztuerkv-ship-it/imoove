/**
 * Client-only live-driver marker helpers (customer map).
 * No server heading / snap-to-road — bearing from consecutive GPS fixes.
 */

export const LIVE_DRIVER_MIN_MOVE_M = 1.5;
/** Beyond this, snap instead of tween (glitch / first big jump). */
export const LIVE_DRIVER_SNAP_DISTANCE_M = 180;
export const LIVE_DRIVER_TWEEN_MIN_MS = 700;
export const LIVE_DRIVER_TWEEN_MAX_MS = 2200;
export const LIVE_DRIVER_CAMERA_MIN_INTERVAL_MS = 400;
export const LIVE_DRIVER_CAMERA_DURATION_MS = 1100;

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Degrees clockwise from north (0…360), same convention as map marker rotation. */
export function bearingDegrees(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(fromLat);
  const φ2 = toRad(toLat);
  const Δλ = toRad(toLon - fromLon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Shortest signed delta (−180…180) from `fromDeg` to `toDeg`. */
export function shortestRotationDelta(fromDeg: number, toDeg: number): number {
  let d = ((((toDeg - fromDeg) % 360) + 540) % 360) - 180;
  return d;
}

export function normalizeHeadingDegrees(heading: number): number {
  if (!Number.isFinite(heading)) return 0;
  return ((heading % 360) + 360) % 360;
}

/**
 * Tween duration from distance + optional time since last fix.
 * Longer gaps → slightly longer tween (capped), tiny moves → shorter.
 */
export function liveDriverTweenDurationMs(
  distanceM: number,
  elapsedSinceLastFixMs?: number,
): number {
  if (!(distanceM > 0) || distanceM >= LIVE_DRIVER_SNAP_DISTANCE_M) return 0;
  const fromGap =
    elapsedSinceLastFixMs != null && elapsedSinceLastFixMs > 0
      ? Math.round(elapsedSinceLastFixMs * 0.9)
      : 1200;
  const fromDist = Math.round(600 + distanceM * 25);
  const raw = Math.max(fromGap, fromDist);
  return Math.min(LIVE_DRIVER_TWEEN_MAX_MS, Math.max(LIVE_DRIVER_TWEEN_MIN_MS, raw));
}
