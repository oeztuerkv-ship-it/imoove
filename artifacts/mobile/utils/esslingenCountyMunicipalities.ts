import { canonicalGermanPlaceKey, haystackContainsMunicipality } from "@/utils/germanPlaceKey";

/** Parallel: `artifacts/api-server/src/lib/esslingenCountyMunicipalities.ts` */
export const ESSLINGEN_COUNTY_MUNICIPALITIES = [
  "Altbach",
  "Altdorf",
  "Aichwald",
  "Baltmannsweiler",
  "Bempflingen",
  "Beuren",
  "Deizisau",
  "Denkendorf",
  "Dettingen unter Teck",
  "Esslingen am Neckar",
  "Frickenhausen",
  "Großbettlingen",
  "Hochdorf",
  "Holzmaden",
  "Kirchheim unter Teck",
  "Köngen",
  "Lenningen",
  "Lichtenstein",
  "Lichtenwald",
  "Neidlingen",
  "Neuhausen auf den Fildern",
  "Nürtingen",
  "Oberboihingen",
  "Ostfildern",
  "Owen",
  "Plochingen",
  "Reichenbach an der Fils",
  "Schlaitdorf",
  "Unterensingen",
  "Weilheim an der Teck",
  "Wendlingen am Neckar",
  "Wernau",
  "Wolfschlugen",
  "Neckartailfingen",
  "Neckartenzlingen",
] as const;

const ESSLINGEN_KEY_SET = new Set(
  ESSLINGEN_COUNTY_MUNICIPALITIES.map((m) => canonicalGermanPlaceKey(m)),
);

export function isEsslingenCountyPlace(city: string | null | undefined, displayName: string | null | undefined): boolean {
  const cityKey = canonicalGermanPlaceKey(city);
  const nameKey = canonicalGermanPlaceKey(displayName);
  if (cityKey.includes("esslingen") || nameKey.includes("esslingen")) return true;
  if (cityKey && ESSLINGEN_KEY_SET.has(cityKey)) return true;
  for (const m of ESSLINGEN_COUNTY_MUNICIPALITIES) {
    if (haystackContainsMunicipality(city, m)) return true;
    if (haystackContainsMunicipality(displayName, m)) return true;
  }
  return false;
}
