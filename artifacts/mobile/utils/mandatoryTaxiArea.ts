/**
 * Pflichtfahrgebiet — Koordinaten-Check nur über API (Polygon auf dem Server).
 * Text-Labels als Offline-Fallback für Debug/Hinweise ohne Netz.
 */
import type { GeoLocation } from "@/utils/routing";
import { canonicalGermanPlaceKey } from "@/utils/germanPlaceKey";
import { isEsslingenCountyPlace } from "@/utils/esslingenCountyMunicipalities";

export type MandatoryAreaPoint = {
  displayName: string;
  city?: string | null;
  lat?: number | null;
  lon?: number | null;
};

function isStuttgart(loc: MandatoryAreaPoint): boolean {
  const cityKey = canonicalGermanPlaceKey(loc.city);
  const nameKey = canonicalGermanPlaceKey(loc.displayName);
  return cityKey.includes("stuttgart") || nameKey.includes("stuttgart");
}

function isLeinfeldenEchterdingen(loc: MandatoryAreaPoint): boolean {
  const cityKey = canonicalGermanPlaceKey(loc.city);
  const nameKey = canonicalGermanPlaceKey(loc.displayName);
  const hay = `${cityKey} ${nameKey}`;
  return (
    hay.includes("leinfelden-echterdingen") ||
    hay.includes("leinfelden echterdingen") ||
    hay.includes("leinfelden") ||
    hay.includes("echterdingen") ||
    hay.includes("oberaichen") ||
    hay.includes("unteraichen") ||
    hay.includes("stetten am kalten markt")
  );
}

function isFilderstadt(loc: MandatoryAreaPoint): boolean {
  const cityKey = canonicalGermanPlaceKey(loc.city);
  const nameKey = canonicalGermanPlaceKey(loc.displayName);
  return cityKey.includes("filderstadt") || nameKey.includes("filderstadt");
}

function isMandatoryTaxiAreaByLabels(loc: MandatoryAreaPoint): boolean {
  return (
    isStuttgart(loc) ||
    isEsslingenCountyPlace(loc.city, loc.displayName) ||
    isLeinfeldenEchterdingen(loc) ||
    isFilderstadt(loc)
  );
}

/**
 * Nur Text-Fallback — bei Koordinaten bitte API `mandatory-taxi-area-check` nutzen.
 * Koordinaten allein liefern hier bewusst kein Ergebnis (false), um Radius-/Polygon-Drift zu vermeiden.
 */
export function isMandatoryTaxiAreaLocation(loc: MandatoryAreaPoint): boolean {
  const lat = loc.lat;
  const lon = loc.lon;
  if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
    return false;
  }
  return isMandatoryTaxiAreaByLabels(loc);
}

export function isFixedPriceOutsideMandatoryAreaEligible(
  origin: GeoLocation,
  destination: GeoLocation | null,
): boolean {
  if (!destination) return false;
  return !isMandatoryTaxiAreaLocation(origin) && !isMandatoryTaxiAreaLocation(destination);
}

export function isTripWithinStuttgartEsslingenTariffArea(
  origin: GeoLocation,
  destination: GeoLocation | null,
): boolean {
  if (!destination) return false;
  return isMandatoryTaxiAreaLocation(origin) && isMandatoryTaxiAreaLocation(destination);
}

export function isOnrodaFixRouteEligible(origin: GeoLocation, destination: GeoLocation | null): boolean {
  if (!destination) return false;
  return isFixedPriceOutsideMandatoryAreaEligible(origin, destination);
}
