import { haversineDistance } from "@/utils/routing";

/** GPS-Sprünge > 5 km ignorieren (Glitch/Tunnel). */
export const GPS_OUTLIER_JUMP_KM = 5;

export function isGpsOutlierJumpKm(
  prevLat: number | null | undefined,
  prevLon: number | null | undefined,
  nextLat: number,
  nextLon: number,
  maxJumpKm = GPS_OUTLIER_JUMP_KM,
): boolean {
  if (
    prevLat == null ||
    prevLon == null ||
    !Number.isFinite(prevLat) ||
    !Number.isFinite(prevLon) ||
    !Number.isFinite(nextLat) ||
    !Number.isFinite(nextLon)
  ) {
    return false;
  }
  const distKm = haversineDistance(prevLat, prevLon, nextLat, nextLon);
  return distKm > maxJumpKm;
}

let lastGoodDriverGps: { lat: number; lon: number } | null = null;

/** Akzeptiert GPS-Fix oder null bei Outlier — merkt letzte gültige Position. */
export function acceptDriverGpsFix(lat: number, lon: number): { lat: number; lon: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (
    lastGoodDriverGps &&
    isGpsOutlierJumpKm(lastGoodDriverGps.lat, lastGoodDriverGps.lon, lat, lon)
  ) {
    return null;
  }
  lastGoodDriverGps = { lat, lon };
  return lastGoodDriverGps;
}

export function resetDriverGpsOutlierBaseline(): void {
  lastGoodDriverGps = null;
}
