/**
 * Koordinaten-Pflichtgebiet — synchron zu `artifacts/api-server/src/lib/mandatoryTaxiAreaZones.ts`.
 */

export type MandatoryTaxiZone = {
  id: string;
  lat: number;
  lon: number;
  radiusKm: number;
};

const EARTH_RADIUS_KM = 6371;

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const MANDATORY_TAXI_ZONES: MandatoryTaxiZone[] = [
  { id: "stuttgart", lat: 48.7758, lon: 9.1829, radiusKm: 17 },
  { id: "leinfelden-echterdingen", lat: 48.694, lon: 9.142, radiusKm: 11 },
  { id: "filderstadt", lat: 48.654, lon: 9.219, radiusKm: 8 },
  { id: "esslingen-neckar", lat: 48.7426, lon: 9.3103, radiusKm: 5.5 },
  { id: "nuertingen", lat: 48.6261, lon: 9.3401, radiusKm: 5.5 },
  { id: "ostfildern", lat: 48.724, lon: 9.249, radiusKm: 5 },
  { id: "kirchheim-teck", lat: 48.648, lon: 9.452, radiusKm: 5.5 },
  { id: "plochingen", lat: 48.71, lon: 9.415, radiusKm: 4.5 },
  { id: "wendlingen", lat: 48.674, lon: 9.383, radiusKm: 4.5 },
  { id: "denkendorf", lat: 48.695, lon: 9.332, radiusKm: 4 },
  { id: "deizisau", lat: 48.712, lon: 9.386, radiusKm: 3.5 },
  { id: "koengen", lat: 48.683, lon: 9.365, radiusKm: 3.5 },
  { id: "wernau", lat: 48.683, lon: 9.424, radiusKm: 3.5 },
  { id: "neuhausen-fildern", lat: 48.667, lon: 9.288, radiusKm: 4 },
  { id: "wolfschlugen", lat: 48.649, lon: 9.289, radiusKm: 3.5 },
  { id: "unterensingen", lat: 48.666, lon: 9.238, radiusKm: 3.5 },
  { id: "oberboihingen", lat: 48.664, lon: 9.371, radiusKm: 3.5 },
  { id: "altbach", lat: 48.723, lon: 9.379, radiusKm: 3.5 },
  { id: "aichwald", lat: 48.728, lon: 9.383, radiusKm: 3.5 },
  { id: "baltmannsweiler", lat: 48.75, lon: 9.435, radiusKm: 3.5 },
  { id: "bempflingen", lat: 48.558, lon: 9.267, radiusKm: 3.5 },
  { id: "beuren", lat: 48.583, lon: 9.405, radiusKm: 3.5 },
  { id: "dettingen-teck", lat: 48.617, lon: 9.456, radiusKm: 4 },
  { id: "frickenhausen", lat: 48.594, lon: 9.285, radiusKm: 3.5 },
  { id: "grossbettlingen", lat: 48.592, lon: 9.312, radiusKm: 3 },
  { id: "hochdorf", lat: 48.754, lon: 9.345, radiusKm: 3.5 },
  { id: "holzmaden", lat: 48.637, lon: 9.526, radiusKm: 3.5 },
  { id: "lenningen", lat: 48.558, lon: 9.473, radiusKm: 4 },
  { id: "lichtenstein", lat: 48.687, lon: 9.521, radiusKm: 3.5 },
  { id: "lichtenwald", lat: 48.775, lon: 9.389, radiusKm: 3.5 },
  { id: "neidlingen", lat: 48.575, lon: 9.342, radiusKm: 3.5 },
  { id: "owen", lat: 48.592, lon: 9.452, radiusKm: 3.5 },
  { id: "reichenbach-fils", lat: 48.706, lon: 9.468, radiusKm: 3.5 },
  { id: "schlaitdorf", lat: 48.602, lon: 9.243, radiusKm: 3.5 },
  { id: "weilheim-teck", lat: 48.618, lon: 9.387, radiusKm: 3.5 },
  { id: "neckartailfingen", lat: 48.611, lon: 9.286, radiusKm: 3.5 },
  { id: "neckartenzlingen", lat: 48.589, lon: 9.243, radiusKm: 3.5 },
  { id: "altdorf", lat: 48.802, lon: 9.378, radiusKm: 3.5 },
];

export function mandatoryZoneIdsForCoordinates(lat: number, lon: number): string[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  const hits: string[] = [];
  for (const z of MANDATORY_TAXI_ZONES) {
    if (haversineKm(lat, lon, z.lat, z.lon) <= z.radiusKm + 1e-6) hits.push(z.id);
  }
  return hits;
}

export function isMandatoryTaxiAreaByCoordinates(lat: number, lon: number): boolean {
  return mandatoryZoneIdsForCoordinates(lat, lon).length > 0;
}
