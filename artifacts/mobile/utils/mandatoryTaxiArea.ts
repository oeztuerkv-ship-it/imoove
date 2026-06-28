import type { GeoLocation } from "@/utils/routing";
import { canonicalGermanPlaceKey } from "@/utils/germanPlaceKey";
import { isEsslingenCountyPlace } from "@/utils/esslingenCountyMunicipalities";

export type MandatoryAreaPoint = {
  displayName: string;
  city?: string | null;
};

function isStuttgart(loc: MandatoryAreaPoint): boolean {
  const cityKey = canonicalGermanPlaceKey(loc.city);
  const nameKey = canonicalGermanPlaceKey(loc.displayName);
  return cityKey.includes("stuttgart") || nameKey.includes("stuttgart");
}

function isLeinfeldenEchterdingen(loc: MandatoryAreaPoint): boolean {
  const cityKey = canonicalGermanPlaceKey(loc.city);
  const nameKey = canonicalGermanPlaceKey(loc.displayName);
  return (
    cityKey.includes("leinfelden-echterdingen") ||
    cityKey.includes("leinfelden echterdingen") ||
    nameKey.includes("leinfelden-echterdingen") ||
    nameKey.includes("leinfelden echterdingen")
  );
}

function isFilderstadt(loc: MandatoryAreaPoint): boolean {
  const cityKey = canonicalGermanPlaceKey(loc.city);
  const nameKey = canonicalGermanPlaceKey(loc.displayName);
  return cityKey.includes("filderstadt") || nameKey.includes("filderstadt");
}

export function isMandatoryTaxiAreaLocation(loc: MandatoryAreaPoint): boolean {
  return (
    isStuttgart(loc) ||
    isEsslingenCountyPlace(loc.city, loc.displayName) ||
    isLeinfeldenEchterdingen(loc) ||
    isFilderstadt(loc)
  );
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
