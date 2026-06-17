import { haversineDistanceKm } from "./serviceRegionMatch";

/** GPS-Sprünge größer als dieser Wert werden ignoriert (Tunnel/GPS-Glitch). */
export const GPS_OUTLIER_JUMP_KM = 5;

export function isGpsOutlierJump(
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
  const distKm = haversineDistanceKm(prevLat, prevLon, nextLat, nextLon);
  return distKm > maxJumpKm;
}
