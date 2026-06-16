/** Grobe Ankunftszeit Fahrer → Abholort (km → Min, Stadt-Taxi). */
const DEFAULT_AVG_SPEED_KMH = 32;

export function estimatePickupEtaMinutes(
  driverLat: number,
  driverLon: number,
  pickupLat: number,
  pickupLon: number,
  avgSpeedKmh = DEFAULT_AVG_SPEED_KMH,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(pickupLat - driverLat);
  const dLon = toRad(pickupLon - driverLon);
  const lat1 = toRad(driverLat);
  const lat2 = toRad(pickupLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  if (!Number.isFinite(km) || km <= 0) return 1;
  const minutes = Math.ceil((km / Math.max(avgSpeedKmh, 8)) * 60);
  return Math.max(1, Math.min(120, minutes));
}

export function formatPickupDistanceKm(
  driverLat: number,
  driverLon: number,
  pickupLat: number,
  pickupLon: number,
): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(pickupLat - driverLat);
  const dLon = toRad(pickupLon - driverLon);
  const lat1 = toRad(driverLat);
  const lat2 = toRad(pickupLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  if (!Number.isFinite(km) || km <= 0) return "";
  return `ca. ${km.toFixed(1).replace(".", ",")} km entfernt`;
}
