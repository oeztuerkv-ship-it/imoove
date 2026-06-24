/**
 * Pflichtfahrgebiet Stuttgart / Esslingen (Landkreis) — einfache Text-Heuristik (kein Polygon).
 * Gleiche Logik wie Mobile `utils/mandatoryTaxiArea.ts`.
 */
function normalizeForMatch(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const ESSLINGEN_COUNTY_MUNICIPALITIES = [
  "altbach",
  "aichwald",
  "beuren",
  "deizisau",
  "denkendorf",
  "dettingen unter teck",
  "esslingen",
  "frickenhausen",
  "grossbettlingen",
  "hochdorf",
  "holzmaden",
  "kirchheim unter teck",
  "koengen",
  "köngen",
  "lenningen",
  "lichtenwald",
  "neuhausen auf den fildern",
  "neidlingen",
  "neckartailfingen",
  "neckartenzlingen",
  "nuertingen",
  "oberboihingen",
  "ostfildern",
  "owen",
  "plochingen",
  "reichenbach an der fils",
  "schlaitdorf",
  "unterensingen",
  "weilheim an der teck",
  "wendlingen am neckar",
  "wolfschlugen",
];

export type MandatoryAreaPoint = {
  displayName: string;
  city?: string | null;
};

function isStuttgart(normCity: string, normName: string): boolean {
  return normCity.includes("stuttgart") || normName.includes("stuttgart");
}

function isLeinfeldenEchterdingen(normCity: string, normName: string): boolean {
  return (
    normCity.includes("leinfelden-echterdingen") ||
    normCity.includes("leinfelden echterdingen") ||
    normName.includes("leinfelden-echterdingen") ||
    normName.includes("leinfelden echterdingen")
  );
}

function isFilderstadt(normCity: string, normName: string): boolean {
  return normCity.includes("filderstadt") || normName.includes("filderstadt");
}

function isEsslingenCounty(normCity: string, normName: string): boolean {
  if (normCity.includes("esslingen") || normName.includes("esslingen")) return true;
  return ESSLINGEN_COUNTY_MUNICIPALITIES.some(
    (municipality) => normCity.includes(municipality) || normName.includes(municipality),
  );
}

/** Liegt der Punkt im Taxameter-Pflichtgebiet (Stuttgart / Esslingen-Korridor)? */
export function isMandatoryTaxiAreaLocation(point: MandatoryAreaPoint): boolean {
  const normCity = normalizeForMatch(point.city);
  const normName = normalizeForMatch(point.displayName);
  return (
    isStuttgart(normCity, normName) ||
    isEsslingenCounty(normCity, normName) ||
    isLeinfeldenEchterdingen(normCity, normName) ||
    isFilderstadt(normCity, normName)
  );
}

/** Festpreis nur wenn Start und Ziel außerhalb des Pflichtfahrgebiets liegen. */
export function isFixedPriceOutsideMandatoryAreaEligible(
  from: MandatoryAreaPoint,
  to: MandatoryAreaPoint,
): boolean {
  return !isMandatoryTaxiAreaLocation(from) && !isMandatoryTaxiAreaLocation(to);
}
