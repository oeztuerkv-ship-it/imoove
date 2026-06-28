/**
 * Festpreis-Eligibility (Mobile) — gleiche Regeln wie API `fixedPriceMandatoryArea.ts`.
 * Getrennt von `mandatoryTaxiArea` (Tarifkorridor / Taxameter-Hinweise).
 */

import type { GeoLocation } from "@/utils/routing";

export const DEFAULT_FIXED_PRICE_MANDATORY_AREA_CITIES = ["Stuttgart", "Esslingen"] as const;

export const FIXED_PRICE_MSG_BOTH_MANDATORY =
  "Festpreis nicht möglich – Taxameter-Pflicht in diesem Gebiet";

export const FIXED_PRICE_MSG_SAME_CITY =
  "Festpreis nicht möglich – Start und Ziel liegen in derselben Stadt";

export type FixedPriceLocationPoint = {
  displayName: string;
  city?: string | null;
};

function normalizeForMatch(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function parseFixedPriceMandatoryAreaCities(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_FIXED_PRICE_MANDATORY_AREA_CITIES];
  const out: string[] = [];
  for (const item of raw) {
    const s = typeof item === "string" ? item.trim() : "";
    if (s && !out.some((x) => normalizeForMatch(x) === normalizeForMatch(s))) out.push(s);
  }
  return out.length > 0 ? out : [...DEFAULT_FIXED_PRICE_MANDATORY_AREA_CITIES];
}

/** Stadt-Label für Zuordnung (city-Feld oder letztes Segment der Adresse, ohne PLZ). */
export function resolvePointCityLabel(point: FixedPriceLocationPoint): string {
  const fromCity = typeof point.city === "string" ? point.city.trim() : "";
  if (fromCity) return normalizeForMatch(fromCity);
  const parts = String(point.displayName ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  const last = parts[parts.length - 1] ?? "";
  const withoutPlz = last.replace(/^\d{5}\s*/, "").trim();
  return normalizeForMatch(withoutPlz || last);
}

export function isPointInFixedPriceMandatoryArea(
  point: FixedPriceLocationPoint,
  mandatoryCities: string[],
): boolean {
  const label = resolvePointCityLabel(point);
  if (!label) return false;
  for (const entry of mandatoryCities) {
    const term = normalizeForMatch(entry);
    if (!term) continue;
    if (label === term || label.includes(term)) return true;
  }
  return false;
}

export type FixedPriceEligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: "both_in_mandatory_area" | "same_city"; message: string };

export function evaluateFixedPriceEligibility(args: {
  from: FixedPriceLocationPoint;
  to: FixedPriceLocationPoint;
  mandatoryCities: string[];
}): FixedPriceEligibilityResult {
  const fromIn = isPointInFixedPriceMandatoryArea(args.from, args.mandatoryCities);
  const toIn = isPointInFixedPriceMandatoryArea(args.to, args.mandatoryCities);
  if (fromIn && toIn) {
    return {
      eligible: false,
      reason: "both_in_mandatory_area",
      message: FIXED_PRICE_MSG_BOTH_MANDATORY,
    };
  }
  const fromCity = resolvePointCityLabel(args.from);
  const toCity = resolvePointCityLabel(args.to);
  if (fromCity && toCity && fromCity === toCity) {
    return {
      eligible: false,
      reason: "same_city",
      message: FIXED_PRICE_MSG_SAME_CITY,
    };
  }
  return { eligible: true };
}

export function geoLocationToFixedPricePoint(loc: GeoLocation): FixedPriceLocationPoint {
  return {
    displayName: loc.displayName,
    city: loc.city?.trim() || null,
  };
}

export function selectedAddressToFixedPricePoint(input: {
  fullName: string;
  name: string;
  subline: string;
  city?: string | null;
}): FixedPriceLocationPoint {
  const city =
    typeof input.city === "string" && input.city.trim()
      ? input.city.trim()
      : sublineCity(input.subline);
  return {
    displayName: input.fullName || input.name,
    city,
  };
}

function sublineCity(subline: string): string | null {
  const parts = subline.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0]?.trim() || null;
  return parts.slice(1).join(" ").trim() || null;
}
