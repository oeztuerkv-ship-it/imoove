/**
 * Festpreis nur für Reservierungen außerhalb des Pflichtfahrgebiets.
 * Taxameter/Tariflogik im Pflichtgebiet bleibt unverändert (siehe evaluateFixedPriceEligibility).
 *
 * Geografie:
 * - Innerhalb BW ohne Stuttgart-Beteiligung: beide Endpunkte in Baden-Württemberg.
 * - Stuttgart-Ausnahme: mindestens ein Endpunkt im Stuttgart-Gebiet → Start/Ziel bundesweit in DE.
 */
import { isFarFutureReservation } from "./dispatchStatus";
import { checkFixedPriceBooking, type FixedPriceCheckResult } from "./fixedPriceBooking";
import {
  isPointInFixedPriceMandatoryArea,
  type FixedPriceLocationPoint,
} from "./fixedPriceMandatoryArea";
import { isMandatoryTaxiAreaLocation } from "./mandatoryTaxiArea";

export const RESERVATION_FIXED_PRICE_HINT_DE =
  "Bei Fahrten außerhalb des Pflichtfahrgebiets kann ein verbindlicher Festpreis vor Fahrtbeginn vereinbart werden.";

/** Grobe Bounding-Box Baden-Württemberg (Reservierungen ohne Stuttgart-Beteiligung). */
export const BADEN_WUERTTEMBERG_BBOX = {
  minLat: 47.532,
  maxLat: 49.791,
  minLon: 7.511,
  maxLon: 10.496,
} as const;

/** Grobe Bounding-Box Deutschland (Stuttgart-Ausnahme: bundesweite Festpreis-Reservierung). */
export const GERMANY_BBOX = {
  minLat: 47.27,
  maxLat: 55.06,
  minLon: 5.87,
  maxLon: 15.04,
} as const;

const STUTTGART_MANDATORY_ONLY = ["Stuttgart"] as const;

export function isPointInGermany(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return (
    lat >= GERMANY_BBOX.minLat &&
    lat <= GERMANY_BBOX.maxLat &&
    lon >= GERMANY_BBOX.minLon &&
    lon <= GERMANY_BBOX.maxLon
  );
}

export function isStuttgartZonePoint(point: FixedPriceLocationPoint): boolean {
  return isPointInFixedPriceMandatoryArea(point, [...STUTTGART_MANDATORY_ONLY]);
}

export function isPointInBadenWuerttemberg(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return (
    lat >= BADEN_WUERTTEMBERG_BBOX.minLat &&
    lat <= BADEN_WUERTTEMBERG_BBOX.maxLat &&
    lon >= BADEN_WUERTTEMBERG_BBOX.minLon &&
    lon <= BADEN_WUERTTEMBERG_BBOX.maxLon
  );
}

export function isBothInMandatoryTaxiArea(
  from: FixedPriceLocationPoint,
  to: FixedPriceLocationPoint,
): boolean {
  return isMandatoryTaxiAreaLocation(from) && isMandatoryTaxiAreaLocation(to);
}

export function isFixedPriceReservationRequest(
  pricingMode: string | null | undefined,
  scheduledAtIso: string | null | undefined,
): boolean {
  return String(pricingMode ?? "").trim() === "fixed_price" && isFarFutureReservation(scheduledAtIso);
}

/** Reservierung mit Festpreis: kein Einfahrt-Gebiet (Stuttgart/Esslingen) nötig — Geografie + Eligibility. */
export function shouldBypassServiceAreaForFixedPriceReservation(
  pricingMode: string | null | undefined,
  scheduledAtIso: string | null | undefined,
): boolean {
  return isFixedPriceReservationRequest(pricingMode, scheduledAtIso);
}

export function validateFixedPriceReservationEndpoints(
  from: FixedPriceLocationPoint,
  to: FixedPriceLocationPoint,
): { ok: true } | { ok: false; error: string; message: string } {
  const stuttgartInvolved = isStuttgartZonePoint(from) || isStuttgartZonePoint(to);

  if (stuttgartInvolved) {
    const fromOk = isPointInGermany(from.lat, from.lon);
    const toOk = isPointInGermany(to.lat, to.lon);
    if (fromOk && toOk) return { ok: true };
    return {
      ok: false,
      error: "reservation_outside_germany",
      message:
        "Festpreis-Reservierungen mit Stuttgart benötigen gültige Start- und Zielkoordinaten in Deutschland.",
    };
  }

  const fromOk = isPointInBadenWuerttemberg(from.lat, from.lon);
  const toOk = isPointInBadenWuerttemberg(to.lat, to.lon);
  if (fromOk && toOk) return { ok: true };
  return {
    ok: false,
    error: "reservation_outside_bw",
    message: "Festpreis-Reservierungen sind derzeit nur innerhalb Baden-Württemberg möglich.",
  };
}

/** @deprecated Use validateFixedPriceReservationEndpoints */
export const validateBwReservationEndpoints = validateFixedPriceReservationEndpoints;

export type ReservationFixedPriceEligibility =
  | { eligible: true; reason: "outside_mandatory_area" }
  | { eligible: false; reason: string; message: string };

/**
 * Festpreis-Reservierung: gleiche Eligibility wie checkFixedPriceBooking,
 * aber explizit dokumentiert — innerhalb Pflichtgebiet → Taxameter (nicht eligible).
 */
export function evaluateReservationFixedPriceEligibility(args: {
  opPayload: Record<string, unknown>;
  from: FixedPriceLocationPoint;
  to: FixedPriceLocationPoint;
  distanceKm: number;
  vehicle?: string;
}): ReservationFixedPriceEligibility {
  const check: FixedPriceCheckResult = checkFixedPriceBooking({
    opPayload: args.opPayload,
    from: args.from,
    to: args.to,
    distanceKm: args.distanceKm,
    vehicle: args.vehicle,
  });
  if (check.eligible) {
    return { eligible: true, reason: "outside_mandatory_area" };
  }
  return {
    eligible: false,
    reason: check.reason,
    message: check.message,
  };
}
