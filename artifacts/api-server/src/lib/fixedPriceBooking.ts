import type { TariffBookingSnapshotV1 } from "../domain/rideRequest";
import {
  isFixedPriceOutsideMandatoryAreaEligible,
  type MandatoryAreaPoint,
} from "./mandatoryTaxiArea";
import { TARIFF_ENGINE_SCHEMA_VERSION } from "./bookingTariffEstimate";
import {
  bookingPriceToleranceEur,
  operationalConfigVersionFromPayload,
  type RideBookingPricingResult,
  type RidePricingMode,
} from "./rideBookingPricing";

function tariffsSection(op: Record<string, unknown>): Record<string, unknown> {
  const t = op.tariffs;
  if (t !== null && typeof t === "object" && !Array.isArray(t)) return t as Record<string, unknown>;
  return {};
}

function num(v: unknown, fallback: number): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : fallback;
}

export function readFixedPriceTariffParams(op: Record<string, unknown>): {
  active: boolean;
  baseFeeEur: number;
  perKmEur: number;
} {
  const t = tariffsSection(op);
  const active = t.fixedPriceOutsideActive !== false;
  return {
    active,
    baseFeeEur: Math.max(0, num(t.onrodaFixBase, 3.5)),
    perKmEur: Math.max(0, num(t.onrodaFixPerKm, 2.2)),
  };
}

/** Gleiche Rundung wie Mobile `calculateOnrodaFixFareConfig`. */
export function computeFixedPriceEur(distanceKm: number, baseFeeEur: number, perKmEur: number): {
  distanceKm: number;
  distanceChargeEur: number;
  priceEur: number;
} {
  const d = Math.max(0, distanceKm);
  const distanceChargeEur = Math.ceil((d * perKmEur + Number.EPSILON) * 10) / 10;
  const priceEur = Math.ceil(baseFeeEur + distanceChargeEur - Number.EPSILON);
  return {
    distanceKm: Math.round(d * 100) / 100,
    distanceChargeEur,
    priceEur,
  };
}

export type FixedPriceCheckResult =
  | {
      ok: true;
      eligible: true;
      pricingMode: "fixed_price";
      priceEur: number;
      distanceKm: number;
      baseFeeEur: number;
      perKmEur: number;
      distanceChargeEur: number;
    }
  | {
      ok: true;
      eligible: false;
      reason: "fixed_price_disabled" | "inside_mandatory_taxi_area" | "distance_km_invalid";
      message: string;
    };

export function checkFixedPriceBooking(args: {
  opPayload: Record<string, unknown>;
  from: MandatoryAreaPoint;
  to: MandatoryAreaPoint;
  distanceKm: number;
}): FixedPriceCheckResult {
  const params = readFixedPriceTariffParams(args.opPayload);
  if (!params.active) {
    return {
      ok: true,
      eligible: false,
      reason: "fixed_price_disabled",
      message: "Festpreis-Buchungen sind derzeit nicht verfügbar.",
    };
  }
  if (!isFixedPriceOutsideMandatoryAreaEligible(args.from, args.to)) {
    return {
      ok: true,
      eligible: false,
      reason: "inside_mandatory_taxi_area",
      message:
        "Festpreis gilt nur außerhalb von Stuttgart und Esslingen. Bitte normale Taxameter-Buchung wählen.",
    };
  }
  if (!Number.isFinite(args.distanceKm) || args.distanceKm <= 0) {
    return {
      ok: true,
      eligible: false,
      reason: "distance_km_invalid",
      message: "Strecke konnte nicht berechnet werden.",
    };
  }
  const priced = computeFixedPriceEur(args.distanceKm, params.baseFeeEur, params.perKmEur);
  return {
    ok: true,
    eligible: true,
    pricingMode: "fixed_price",
    priceEur: priced.priceEur,
    distanceKm: priced.distanceKm,
    baseFeeEur: params.baseFeeEur,
    perKmEur: params.perKmEur,
    distanceChargeEur: priced.distanceChargeEur,
  };
}

export function computeFixedPriceRideBookingPricing(args: {
  opPayload: Record<string, unknown>;
  from: MandatoryAreaPoint;
  to: MandatoryAreaPoint;
  distanceKm: number;
  tripMinutes: number;
  vehicle: string;
  at?: Date;
}):
  | (RideBookingPricingResult & { ok: true })
  | { ok: false; error: string; message: string } {
  const check = checkFixedPriceBooking({
    opPayload: args.opPayload,
    from: args.from,
    to: args.to,
    distanceKm: args.distanceKm,
  });
  if (!check.eligible) {
    return {
      ok: false,
      error: check.reason,
      message: check.message,
    };
  }
  const at = args.at ?? new Date();
  const operationalConfigVersion = operationalConfigVersionFromPayload(args.opPayload);
  const pricingMode: RidePricingMode = "fixed_price";
  const snapshot: TariffBookingSnapshotV1 = {
    engineSchemaVersion: TARIFF_ENGINE_SCHEMA_VERSION,
    serviceRegionId: null,
    finalPriceEur: check.priceEur,
    subtotal: check.priceEur,
    afterMinFare: check.priceEur,
    breakdown: {
      baseFare: check.baseFeeEur,
      distanceCharge: check.distanceChargeEur,
      waitingCharge: 0,
      fixedPriceFormula: true,
      perKmEur: check.perKmEur,
    },
    distanceKm: check.distanceKm,
    tripMinutes: args.tripMinutes,
    waitingMinutes: 0,
    vehicle: args.vehicle,
    at: at.toISOString(),
    operationalConfigVersion,
    pricingMode,
    mergedTariffAudit: {
      onrodaFixBase: check.baseFeeEur,
      onrodaFixPerKm: check.perKmEur,
      fixedPriceOutside: true,
    },
  };
  return {
    ok: true,
    pricingMode,
    operationalConfigVersion,
    serviceRegionId: null,
    finalPrice: check.priceEur,
    estBook: {
      finalRounded: check.priceEur,
      subtotal: check.priceEur,
      afterMinFare: check.priceEur,
      breakdown: snapshot.breakdown,
    },
    snapshot,
  };
}

export { bookingPriceToleranceEur };
