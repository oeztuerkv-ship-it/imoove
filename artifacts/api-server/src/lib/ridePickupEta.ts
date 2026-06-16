import { haversineDistanceKm } from "./serviceRegionMatch";

/** Stadt-Taxi: grobe Ankunftszeit aus Luftlinie (km → Min). */
const DEFAULT_AVG_SPEED_KMH = 32;

export function estimatePickupEtaMinutes(
  driverLat: number,
  driverLon: number,
  pickupLat: number,
  pickupLon: number,
  avgSpeedKmh = DEFAULT_AVG_SPEED_KMH,
): number {
  const km = haversineDistanceKm(driverLat, driverLon, pickupLat, pickupLon);
  if (!Number.isFinite(km) || km <= 0) return 1;
  const minutes = Math.ceil((km / Math.max(avgSpeedKmh, 8)) * 60);
  return Math.max(1, Math.min(120, minutes));
}
