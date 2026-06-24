import type { GeoLocation } from "@/utils/routing";

function normalizeForMatch(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const ESSLINGEN_COUNTY_MUNICIPALITIES = [
  "altbach", "aichwald", "beuren", "deizisau", "denkendorf", "dettingen unter teck",
  "esslingen", "frickenhausen", "grossbettlingen", "hochdorf",
  "holzmaden", "kirchheim unter teck", "koengen", "köngen",
  "lenningen", "lichtenwald", "neuhausen auf den fildern", "neidlingen", "neckartailfingen",
  "neckartenzlingen", "nuertingen", "oberboihingen", "ostfildern", "owen",
  "plochingen", "reichenbach an der fils", "schlaitdorf", "unterensingen", "weilheim an der teck",
  "wendlingen am neckar", "wolfschlugen",
];

function isStuttgart(loc: GeoLocation): boolean {
  const city = normalizeForMatch(loc.city);
  if (city.includes("stuttgart")) return true;
  return normalizeForMatch(loc.displayName).includes("stuttgart");
}

function isLeinfeldenEchterdingen(loc: GeoLocation): boolean {
  const city = normalizeForMatch(loc.city);
  if (city.includes("leinfelden-echterdingen") || city.includes("leinfelden echterdingen")) return true;
  const name = normalizeForMatch(loc.displayName);
  return name.includes("leinfelden-echterdingen") || name.includes("leinfelden echterdingen");
}

function isFilderstadt(loc: GeoLocation): boolean {
  const city = normalizeForMatch(loc.city);
  if (city.includes("filderstadt")) return true;
  return normalizeForMatch(loc.displayName).includes("filderstadt");
}

function isEsslingenCounty(loc: GeoLocation): boolean {
  const city = normalizeForMatch(loc.city);
  if (city.includes("esslingen")) return true;
  if (ESSLINGEN_COUNTY_MUNICIPALITIES.some((municipality) => city.includes(municipality))) return true;
  const name = normalizeForMatch(loc.displayName);
  if (name.includes("esslingen")) return true;
  return ESSLINGEN_COUNTY_MUNICIPALITIES.some((municipality) => name.includes(municipality));
}

export function isMandatoryTaxiAreaLocation(loc: GeoLocation): boolean {
  return (
    isStuttgart(loc) ||
    isEsslingenCounty(loc) ||
    isLeinfeldenEchterdingen(loc) ||
    isFilderstadt(loc)
  );
}

export function isFixedPriceOutsideMandatoryAreaEligible(
  origin: GeoLocation,
  destination: GeoLocation,
): boolean {
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
