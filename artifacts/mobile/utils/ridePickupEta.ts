/** @deprecated Nur noch für Server-Push-Fallback — Kunden-UI nutzt Fahrer-Navi-ETA. */
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

/** Straßen-Restmeter vom Fahrer-Navi → gleiche km-Anzeige wie Fahrer. */
export function formatDriverNavDistanceKm(remainingDistM: number, opts?: { toDestination?: boolean }): string {
  const m = Number(remainingDistM);
  if (!Number.isFinite(m) || m < 0) return "";
  const km = m / 1000;
  const label = opts?.toDestination ? "zum Ziel" : "entfernt";
  if (km < 0.1) return `ca. ${Math.round(m)} m ${label}`;
  return `ca. ${km.toFixed(1).replace(".", ",")} km ${label}`;
}

/** @deprecated Luftlinie — nicht für Live-ETA/km gegenüber Fahrer-Navi verwenden. */
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
