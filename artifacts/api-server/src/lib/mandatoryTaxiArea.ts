/**
 * Pflichtfahrgebiet Stuttgart / Landkreis Esslingen — Text-Heuristik (kein Polygon).
 * Gleiche Logik wie Mobile `utils/mandatoryTaxiArea.ts`.
 */
import { canonicalGermanPlaceKey } from "./germanPlaceKey";
import { isEsslingenCountyPlace } from "./esslingenCountyMunicipalities";

export type MandatoryAreaPoint = {
  displayName: string;
  city?: string | null;
};

function isStuttgart(city: string | null | undefined, displayName: string | null | undefined): boolean {
  const cityKey = canonicalGermanPlaceKey(city);
  const nameKey = canonicalGermanPlaceKey(displayName);
  return cityKey.includes("stuttgart") || nameKey.includes("stuttgart");
}

function isLeinfeldenEchterdingen(city: string | null | undefined, displayName: string | null | undefined): boolean {
  const cityKey = canonicalGermanPlaceKey(city);
  const nameKey = canonicalGermanPlaceKey(displayName);
  return (
    cityKey.includes("leinfelden-echterdingen") ||
    cityKey.includes("leinfelden echterdingen") ||
    nameKey.includes("leinfelden-echterdingen") ||
    nameKey.includes("leinfelden echterdingen")
  );
}

function isFilderstadt(city: string | null | undefined, displayName: string | null | undefined): boolean {
  const cityKey = canonicalGermanPlaceKey(city);
  const nameKey = canonicalGermanPlaceKey(displayName);
  return cityKey.includes("filderstadt") || nameKey.includes("filderstadt");
}

/** Liegt der Punkt im Taxameter-Pflichtgebiet (Stuttgart / Landkreis Esslingen / Fildern)? */
export function isMandatoryTaxiAreaLocation(point: MandatoryAreaPoint): boolean {
  return (
    isStuttgart(point.city, point.displayName) ||
    isEsslingenCountyPlace(point.city, point.displayName) ||
    isLeinfeldenEchterdingen(point.city, point.displayName) ||
    isFilderstadt(point.city, point.displayName)
  );
}

/** Festpreis nur wenn weder Start noch Ziel im Pflichtgebiet liegt (Legacy-Helfer). */
export function isFixedPriceOutsideMandatoryAreaEligible(
  from: MandatoryAreaPoint,
  to: MandatoryAreaPoint,
): boolean {
  return !isMandatoryTaxiAreaLocation(from) && !isMandatoryTaxiAreaLocation(to);
}
