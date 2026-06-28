/**
 * Festpreis-Eligibility (Taxameter-Pflicht vs. Festpreis außerhalb).
 *
 * Festpreis ist VERBOTEN wenn:
 * 1. Start UND Ziel im Pflichtfahrgebiet (Stuttgart + gesamter Landkreis Esslingen + Fildern), oder
 * 2. Start UND Ziel in derselben Stadt (z. B. beide „Tübingen“).
 *
 * Erlaubt z. B. Stuttgart → Tübingen (nur ein Punkt im Pflichtgebiet) oder Tübingen → Flughafen.
 */

import { canonicalGermanPlaceKey } from "./germanPlaceKey";
import { isEsslingenCountyPlace } from "./esslingenCountyMunicipalities";
import { isMandatoryTaxiAreaLocation } from "./mandatoryTaxiArea";
import { haversineKm } from "./geoDistance";

export type FixedPriceLocationPoint = {
  displayName: string;
  city?: string | null;
  lat?: number | null;
  lon?: number | null;
};

export const DEFAULT_FIXED_PRICE_MANDATORY_AREA_CITIES = ["Stuttgart", "Esslingen"] as const;

export const FIXED_PRICE_MSG_BOTH_MANDATORY =
  "Festpreis nicht möglich – Taxameter-Pflicht in diesem Gebiet";

export const FIXED_PRICE_MSG_SAME_CITY =
  "Festpreis nicht möglich – Start und Ziel liegen in derselben Stadt";

const SKIP_CITY_SEGMENT = /^(deutschland|germany|baden-württemberg|region)/i;

export function readFixedPriceMandatoryAreaCities(op: Record<string, unknown>): string[] {
  const t = op.tariffs;
  const tariffs = t !== null && typeof t === "object" && !Array.isArray(t) ? (t as Record<string, unknown>) : {};
  const raw = tariffs.fixedPriceMandatoryAreaCities;
  if (!Array.isArray(raw)) return [...DEFAULT_FIXED_PRICE_MANDATORY_AREA_CITIES];
  const out: string[] = [];
  for (const item of raw) {
    const s = typeof item === "string" ? item.trim() : "";
    if (s && !out.some((x) => canonicalGermanPlaceKey(x) === canonicalGermanPlaceKey(s))) out.push(s);
  }
  return out.length > 0 ? out : [...DEFAULT_FIXED_PRICE_MANDATORY_AREA_CITIES];
}

/** Stadt-Label für Zuordnung (city-Feld oder sinnvolles Adress-Segment). */
export function resolvePointCityLabel(point: FixedPriceLocationPoint): string {
  const fromCity = typeof point.city === "string" ? point.city.trim() : "";
  if (fromCity) return canonicalGermanPlaceKey(fromCity);
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
    return canonicalGermanPlaceKey(seg);
  }
  return "";
}

function isStuttgartPlace(point: FixedPriceLocationPoint): boolean {
  const label = resolvePointCityLabel(point);
  const nameKey = canonicalGermanPlaceKey(point.displayName);
  return label.includes("stuttgart") || nameKey.includes("stuttgart");
}

/** Admin-Liste: „Esslingen“ = gesamter Landkreis; „Stuttgart“ = Stadtgebiet. */
export function isPointInFixedPriceMandatoryArea(
  point: FixedPriceLocationPoint,
  mandatoryCities: string[],
): boolean {
  for (const entry of mandatoryCities) {
    const term = canonicalGermanPlaceKey(entry);
    if (!term) continue;
    if (term === "esslingen" || term.includes("esslingen")) {
      if (isEsslingenCountyPlace(point.city, point.displayName)) return true;
      continue;
    }
    if (term.includes("stuttgart")) {
      if (isStuttgartPlace(point)) return true;
      continue;
    }
    const label = resolvePointCityLabel(point);
    if (label && (label === term || label.includes(term))) return true;
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
  const fLat = args.from.lat;
  const fLon = args.from.lon;
  const tLat = args.to.lat;
  const tLon = args.to.lon;
  if (
    fLat != null &&
    fLon != null &&
    tLat != null &&
    tLon != null &&
    Number.isFinite(fLat) &&
    Number.isFinite(fLon) &&
    Number.isFinite(tLat) &&
    Number.isFinite(tLon)
  ) {
    const distKm = haversineKm(fLat, fLon, tLat, tLon);
    if (distKm <= 12 && fromTaxi && toTaxi) {
      return {
        eligible: false,
        reason: "same_city",
        message: FIXED_PRICE_MSG_SAME_CITY,
      };
    }
  }
  return { eligible: true };
}
