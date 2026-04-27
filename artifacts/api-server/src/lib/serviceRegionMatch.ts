/**
 * Einfahrt-Gebiet: gleiche Logik für Kunden-API, Finance und (dupliziert) Mobile-Client.
 * match_mode: "substring" (Text in Adresse) | "radius" (Mittelpunkt + km) | später "polygon".
 */
export const EARTH_RADIUS_KM = 6371;

export type ServiceRegionMatchable = {
  id: string;
  matchTerms: string[];
  isActive: boolean;
  matchMode: string;
  centerLat: number | null;
  centerLng: number | null;
  radiusKm: number | null;
};

export function haversineDistanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function normMode(mode: string | null | undefined): "substring" | "radius" | "polygon" | "other" {
  const m = String(mode ?? "").trim().toLowerCase();
  if (m === "radius") return "radius";
  if (m === "polygon" || m === "geofence") return "polygon";
  if (m === "substring" || m === "term" || m === "terms" || m === "") return "substring";
  return "other";
}

/** Radius-Region: Mittelpunkt + Radius vorhanden und sinnvoll. */
export function isRadiusConfigComplete(r: ServiceRegionMatchable): boolean {
  if (r.centerLat == null || r.centerLng == null || r.radiusKm == null) return false;
  if (!Number.isFinite(r.centerLat) || !Number.isFinite(r.centerLng) || !Number.isFinite(r.radiusKm)) return false;
  if (r.radiusKm <= 0) return false;
  return r.centerLat >= -90 && r.centerLat <= 90 && r.centerLng >= -180 && r.centerLng <= 180;
}

export function addressMatchesServiceTerms(address: string, terms: string[]): boolean {
  if (!address || terms.length === 0) return false;
  const a = address.toLowerCase();
  for (const t of terms) {
    const s = String(t).trim().toLowerCase();
    if (s && a.includes(s)) return true;
  }
  return false;
}

/**
 * Geographische/Adress-Übereinstimmung ohne isActive-Filter (für „deaktivierte Zone erkannt?“).
 */
export function regionCoversPointOrAddress(
  r: ServiceRegionMatchable,
  fromFull: string,
  fromLat: number | null,
  fromLng: number | null,
): boolean {
  const mode = normMode(r.matchMode);
  if (mode === "radius") {
    if (!isRadiusConfigComplete(r)) return false;
    if (fromLat == null || fromLng == null || !Number.isFinite(fromLat) || !Number.isFinite(fromLng)) return false;
    return haversineDistanceKm(fromLat, fromLng, r.centerLat!, r.centerLng!) <= r.radiusKm! + 1e-6;
  }
  if (mode === "polygon") {
    return false;
  }
  return addressMatchesServiceTerms(String(fromFull ?? "").trim(), r.matchTerms);
}

/**
 * Eine Kachel der Abhol- oder Ziel-Position: Region passt, wenn `isActive` (Aufrufer filtern) und
 * entweder Radius+Koordinate oder Substring+Adresse.
 */
export function pointMatchesServiceRegion(
  r: ServiceRegionMatchable,
  fromFull: string,
  fromLat: number | null,
  fromLng: number | null,
): boolean {
  if (!r.isActive) return false;
  return regionCoversPointOrAddress(r, fromFull, fromLat, fromLng);
}

/**
 * Erste passende Einfahrt-Region in Server-Reihenfolge (Sortierung wie `listServiceRegionsForApi`).
 */
export function findServiceRegionIdForPickup(
  fromFull: string,
  fromLat: number | null,
  fromLng: number | null,
  serviceRegions: ServiceRegionMatchable[],
): string | null {
  for (const reg of serviceRegions.filter((r) => r.isActive)) {
    if (pointMatchesServiceRegion(reg, fromFull, fromLat, fromLng)) {
      return reg.id;
    }
  }
  return null;
}

/** Wenn true: Buchungs-API muss from/to-Koordinaten mitschicken, sonst keine sinnvolle Prüfung. */
export function anyActiveRegionRequiresClientCoordinates(regions: ServiceRegionMatchable[]): boolean {
  return regions.some((r) => r.isActive && normMode(r.matchMode) === "radius" && isRadiusConfigComplete(r));
}

/**
 * Beide Fahrtendpunkte müssen in mindestens je einem *aktiven* Gebiet matchen. Fail-open ohne aktive Gebiete.
 */
export function validateServiceAreaForRidePoints(
  fromFull: string,
  toFull: string,
  fromLat: number | null,
  fromLng: number | null,
  toLat: number | null,
  toLng: number | null,
  regions: ServiceRegionMatchable[],
): boolean {
  const fullFrom = String(fromFull ?? "").trim();
  const fullTo = String(toFull ?? "").trim();
  const active = regions.filter((r) => r.isActive);
  if (active.length === 0) return true;
  const fromOk = active.some((r) => pointMatchesServiceRegion(r, fullFrom, fromLat, fromLng));
  const toOk = active.some((r) => pointMatchesServiceRegion(r, fullTo, toLat, toLng));
  return fromOk && toOk;
}
