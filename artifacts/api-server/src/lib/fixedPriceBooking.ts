import type { TariffBookingSnapshotV1 } from "../domain/rideRequest";
import {
  evaluateFixedPriceEligibility,
  readFixedPriceMandatoryAreaCities,
  type FixedPriceLocationPoint,
} from "./fixedPriceMandatoryArea";
import { TARIFF_ENGINE_SCHEMA_VERSION } from "./bookingTariffEstimate";
import { resolveXlPricingConfig } from "./operationalTariffEngine";
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
  mandatoryAreaCities: string[];
} {
  const t = tariffsSection(op);
  const active = t.fixedPriceOutsideActive !== false;
  return {
    active,
    baseFeeEur: Math.max(0, num(t.onrodaFixBase, 3.5)),
    perKmEur: Math.max(0, num(t.onrodaFixPerKm, 2.2)),
    mandatoryAreaCities: readFixedPriceMandatoryAreaCities(op),
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

function normalizeFixedPriceVehicleId(vehicle: string): "standard" | "xl" | "wheelchair" {
  const v = vehicle.trim().toLowerCase();
  if (v.includes("xl") || v === "van" || v.includes("großraum")) return "xl";
  if (v.includes("rollstuhl") || v.includes("wheelchair")) return "wheelchair";
  return "standard";
}

/** XL/Rollstuhl-Aufschlag auf Festpreis-Basis (Admin-Tarif, fester Betrag). */
export function computeFixedPriceVehicleSurchargeEur(
  opPayload: Record<string, unknown>,
  vehicle: string,
): number {
  const merged = tariffsSection(opPayload);
  const vClass = normalizeFixedPriceVehicleId(vehicle);
  if (vClass === "xl") {
    const xlCfg = resolveXlPricingConfig(merged);
    if (xlCfg.mode === "multiplier") return 0;
    return Math.max(0, Math.round(xlCfg.fixedEur * 100) / 100);
  }
  if (vClass === "wheelchair") {
    return Math.max(0, Math.round(num(merged.wheelchairFixedSurchargeEur, 0) * 100) / 100);
  }
  return 0;
}

export type FixedPriceCheckResult =
  | {
      ok: true;
      eligible: true;
      pricingMode: "fixed_price";
      priceEur: number;
      basePriceEur: number;
      vehicleSurchargeEur: number;
      distanceKm: number;
      baseFeeEur: number;
      perKmEur: number;
      distanceChargeEur: number;
    }
  | {
      ok: true;
      eligible: false;
      reason:
        | "fixed_price_disabled"
        | "both_in_mandatory_area"
        | "same_city"
        | "distance_km_invalid";
      message: string;
    };

export function checkFixedPriceBooking(args: {
  opPayload: Record<string, unknown>;
  from: FixedPriceLocationPoint;
  to: FixedPriceLocationPoint;
  distanceKm: number;
  vehicle?: string;
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
  const eligibility = evaluateFixedPriceEligibility({
    from: args.from,
    to: args.to,
    mandatoryCities: params.mandatoryAreaCities,
  });
  if (!eligibility.eligible) {
    return {
      ok: true,
      eligible: false,
      reason: eligibility.reason,
      message: eligibility.message,
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
  const vehicleSurchargeEur = computeFixedPriceVehicleSurchargeEur(args.opPayload, args.vehicle ?? "standard");
  const priceEur = Math.ceil((priced.priceEur + vehicleSurchargeEur - Number.EPSILON) * 100) / 100;
  return {
    ok: true,
    eligible: true,
    pricingMode: "fixed_price",
    priceEur,
    basePriceEur: priced.priceEur,
    vehicleSurchargeEur,
    distanceKm: priced.distanceKm,
    baseFeeEur: params.baseFeeEur,
    perKmEur: params.perKmEur,
    distanceChargeEur: priced.distanceChargeEur,
  };
}

export function computeFixedPriceRideBookingPricing(args: {
  opPayload: Record<string, unknown>;
  from: FixedPriceLocationPoint;
  to: FixedPriceLocationPoint;
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
    vehicle: args.vehicle,
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
      ...(check.vehicleSurchargeEur > 0
        ? { vehicleSurchargeEur: check.vehicleSurchargeEur, xlFixedSurchargeEur: check.vehicleSurchargeEur }
        : {}),
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
      mandatoryAreaCities: readFixedPriceMandatoryAreaCities(args.opPayload),
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
