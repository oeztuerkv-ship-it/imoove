/**
 * Festpreis-Eligibility: Pflichtfahrgebiet (Stuttgart / Esslingen-Korridor) + Admin-Städte + gleiche Stadt.
 *
 * Blockiert, wenn BEIDE Punkte im Taxameter-Pflichtgebiet liegen (`mandatoryTaxiArea`),
 * oder BEIDE in der admin-pflegbaren Städte-Liste, oder Start-Stadt = Ziel-Stadt.
 * Erlaubt z. B. Tübingen ↔ Flughafen (nur ein Punkt im Pflichtgebiet).
 */

import { isMandatoryTaxiAreaLocation } from "./mandatoryTaxiArea";

export type FixedPriceLocationPoint = {
  displayName: string;
  city?: string | null;
};

export const DEFAULT_FIXED_PRICE_MANDATORY_AREA_CITIES = ["Stuttgart", "Esslingen"] as const;

export const FIXED_PRICE_MSG_BOTH_MANDATORY =
  "Festpreis nicht möglich – Taxameter-Pflicht in diesem Gebiet";

export const FIXED_PRICE_MSG_SAME_CITY =
  "Festpreis nicht möglich – Start und Ziel liegen in derselben Stadt";

function normalizeForMatch(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function readFixedPriceMandatoryAreaCities(op: Record<string, unknown>): string[] {
  const t = op.tariffs;
  const tariffs = t !== null && typeof t === "object" && !Array.isArray(t) ? (t as Record<string, unknown>) : {};
  const raw = tariffs.fixedPriceMandatoryAreaCities;
  if (!Array.isArray(raw)) return [...DEFAULT_FIXED_PRICE_MANDATORY_AREA_CITIES];
  const out: string[] = [];
  for (const item of raw) {
    const s = typeof item === "string" ? item.trim() : "";
    if (s && !out.some((x) => normalizeForMatch(x) === normalizeForMatch(s))) out.push(s);
  }
  return out.length > 0 ? out : [...DEFAULT_FIXED_PRICE_MANDATORY_AREA_CITIES];
}

const SKIP_CITY_SEGMENT = /^(deutschland|germany|baden-württemberg|region)/i;

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

/** Liegt der Punkt in einer admin-pflegbaren Pflichtfahrgebiet-Stadt? */
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

export type FixedPriceEligibilityDenyReason =
  | "both_in_mandatory_area"
  | "same_city"
  | "fixed_price_disabled"
  | "distance_km_invalid";

export type FixedPriceEligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: FixedPriceEligibilityDenyReason; message: string };

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
