/**
 * Festpreis: admin-pflegbare Pflichtfahrgebiet-Städte (getrennt von mandatoryTaxiArea).
 * Regel: Festpreis nur NICHT möglich, wenn BEIDE Punkte in der Liste liegen — oder Start-Stadt = Ziel-Stadt.
 */

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

/** Liegt der Punkt in einer admin-pflegbaren Pflichtfahrgebiet-Stadt? */
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
