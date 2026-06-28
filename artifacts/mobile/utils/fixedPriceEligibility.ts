/**
 * Festpreis-Eligibility (Mobile) — gleiche Regeln wie API `fixedPriceMandatoryArea.ts`.
 */

import { isMandatoryTaxiAreaLocation } from "@/utils/mandatoryTaxiArea";
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

const SKIP_CITY_SEGMENT = /^(deutschland|germany|baden-württemberg|region)/i;

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

/** Stadt-Label für Zuordnung (city-Feld oder sinnvolles Adress-Segment, ohne PLZ/Landkreis-only). */
export function resolvePointCityLabel(point: FixedPriceLocationPoint): string {
  const fromCity = typeof point.city === "string" ? point.city.trim() : "";
  if (fromCity) return normalizeForMatch(fromCity);
  const parts = String(point.displayName ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const raw = parts[i] ?? "";
    const withoutPlz = raw.replace(/^\d{5}\s*/, "").trim();
    const seg = withoutPlz || raw;
    if (!seg || SKIP_CITY_SEGMENT.test(seg)) continue;
    if (/^landkreis\s/i.test(seg)) continue;
    return normalizeForMatch(seg);
  }
  return "";
}

export function isPointInFixedPriceMandatoryArea(
  point: FixedPriceLocationPoint,
  mandatoryCities: string[],
): boolean {
  const label = resolvePointCityLabel(point);
  if (!label || /^landkreis\s/.test(label)) return false;
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

export type FixedPriceEligibilityDebug = {
  fromPoint: FixedPriceLocationPoint;
  toPoint: FixedPriceLocationPoint;
  fromCityLabel: string;
  toCityLabel: string;
  fromInTaxiArea: boolean;
  toInTaxiArea: boolean;
  fromInCityList: boolean;
  toInCityList: boolean;
  mandatoryCities: string[];
};

export function debugFixedPriceEligibility(args: {
  from: FixedPriceLocationPoint;
  to: FixedPriceLocationPoint;
  mandatoryCities: string[];
}): FixedPriceEligibilityDebug {
  return {
    fromPoint: args.from,
    toPoint: args.to,
    fromCityLabel: resolvePointCityLabel(args.from),
    toCityLabel: resolvePointCityLabel(args.to),
    fromInTaxiArea: isMandatoryTaxiAreaLocation(args.from),
    toInTaxiArea: isMandatoryTaxiAreaLocation(args.to),
    fromInCityList: isPointInFixedPriceMandatoryArea(args.from, args.mandatoryCities),
    toInCityList: isPointInFixedPriceMandatoryArea(args.to, args.mandatoryCities),
    mandatoryCities: args.mandatoryCities,
  };
}

export function evaluateFixedPriceEligibility(args: {
  from: FixedPriceLocationPoint;
  to: FixedPriceLocationPoint;
  mandatoryCities: string[];
}): FixedPriceEligibilityResult {
  const fromTaxi = isMandatoryTaxiAreaLocation(args.from);
  const toTaxi = isMandatoryTaxiAreaLocation(args.to);
  if (fromTaxi && toTaxi) {
    return {
      eligible: false,
      reason: "both_in_mandatory_area",
      message: FIXED_PRICE_MSG_BOTH_MANDATORY,
    };
  }
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
