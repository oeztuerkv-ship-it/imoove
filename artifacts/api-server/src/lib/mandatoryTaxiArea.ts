/**
 * Pflichtfahrgebiet Stuttgart / Landkreis Esslingen — Koordinaten zuerst, Text als Fallback.
 */
import { canonicalGermanPlaceKey } from "./germanPlaceKey";
import { isEsslingenCountyPlace } from "./esslingenCountyMunicipalities";
import { isMandatoryTaxiAreaByCoordinates } from "./mandatoryTaxiAreaZones";

export type MandatoryAreaPoint = {
  displayName: string;
  city?: string | null;
  lat?: number | null;
  lon?: number | null;
};

function isStuttgart(city: string | null | undefined, displayName: string | null | undefined): boolean {
  const cityKey = canonicalGermanPlaceKey(city);
  const nameKey = canonicalGermanPlaceKey(displayName);
  return cityKey.includes("stuttgart") || nameKey.includes("stuttgart");
}

function isLeinfeldenEchterdingen(city: string | null | undefined, displayName: string | null | undefined): boolean {
  const cityKey = canonicalGermanPlaceKey(city);
  const nameKey = canonicalGermanPlaceKey(displayName);
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

function isFilderstadt(city: string | null | undefined, displayName: string | null | undefined): boolean {
  const cityKey = canonicalGermanPlaceKey(city);
  const nameKey = canonicalGermanPlaceKey(displayName);
  return cityKey.includes("filderstadt") || nameKey.includes("filderstadt");
}

function isMandatoryTaxiAreaByLabels(city: string | null | undefined, displayName: string | null | undefined): boolean {
  return (
    isStuttgart(city, displayName) ||
    isEsslingenCountyPlace(city, displayName) ||
    isLeinfeldenEchterdingen(city, displayName) ||
    isFilderstadt(city, displayName)
  );
}

/** Liegt der Punkt im Taxameter-Pflichtgebiet? Koordinaten haben Vorrang vor Geocoding-Labels. */
export function isMandatoryTaxiAreaLocation(point: MandatoryAreaPoint): boolean {
  const lat = point.lat;
  const lon = point.lon;
  if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
    if (isMandatoryTaxiAreaByCoordinates(lat, lon)) return true;
  }
  return isMandatoryTaxiAreaByLabels(point.city, point.displayName);
}

export function isFixedPriceOutsideMandatoryAreaEligible(
  from: MandatoryAreaPoint,
  to: MandatoryAreaPoint,
): boolean {
  return !isMandatoryTaxiAreaLocation(from) && !isMandatoryTaxiAreaLocation(to);
}
