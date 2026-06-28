/**
 * Hilfsfunktionen für Festpreis-Adresspunkte (Mobile).
 * Eligibility-Entscheidung: API `fetchFixedPriceEligibilityCheck` in `fixedPriceApi.ts`.
 */

export type FixedPriceLocationPoint = {
  displayName: string;
  city?: string | null;
  lat?: number | null;
  lon?: number | null;
};

export function selectedAddressToFixedPricePoint(input: {
  fullName: string;
  name: string;
  subline: string;
  city?: string | null;
  lat?: number | null;
  lon?: number | null;
}): FixedPriceLocationPoint {
  const city =
    typeof input.city === "string" && input.city.trim()
      ? input.city.trim()
      : sublineCity(input.subline);
  return {
    displayName: input.fullName || input.name,
    city,
    lat: input.lat ?? null,
    lon: input.lon ?? null,
  };
}

function sublineCity(subline: string): string | null {
  const parts = subline.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0]?.trim() || null;
  return parts.slice(1).join(" ").trim() || null;
}
