import type { ServiceRegionPublic } from "../db/appOperationalData";
import type { TariffBookingSnapshotV1 } from "../domain/rideRequest";
import { computeTaxiPriceLikeFareEstimate, TARIFF_ENGINE_SCHEMA_VERSION } from "./bookingTariffEstimate";

export type RidePricingMode = "taxi_tariff" | "fixed_price" | "hybrid";

function isTariffsObject(op: Record<string, unknown>): Record<string, unknown> {
  const t = op.tariffs;
  if (t !== null && typeof t === "object" && !Array.isArray(t)) return t as Record<string, unknown>;
  return {};
}

export function resolveRidePricingModeFromOperational(op: Record<string, unknown>): RidePricingMode {
  // Aktuelle Produktlinie: nur Taxitarif/Taxameter, kein freier Fixpreis-Modus.
  void op;
  return "taxi_tariff";
}

export function operationalConfigVersionFromPayload(op: Record<string, unknown>): number {
  const v = op.version;
  return typeof v === "number" && Number.isFinite(v) ? v : 1;
}

function compactMergedTariffAudit(merged: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    "baseFare",
    "perKm",
    "minFare",
    "minPrice",
    "rounding",
    "kmPricingModel",
    "rateFirstPerKm",
    "rateAfterPerKm",
    "thresholdKm",
    "waitingPerHour",
    "pricePerMinute",
    "perMin",
    "active",
    "pricingMode",
    "largeVehicleSurcharge",
    "tariffVersion",
    "validFrom",
  ] as const;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(merged, k)) out[k] = merged[k];
  }
  return out;
}

function toNum(v: unknown, fallback = 0): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function toPositiveInt(v: unknown, fallback: number): number {
  const n = Math.round(toNum(v, fallback));
  return n > 0 ? n : fallback;
}

function extractMeterTariffSnapshot(merged: Record<string, unknown>, serviceRegionId: string | null, opVersion: number) {
  const kmModel = merged.kmPricingModel === "single" ? "single" : "two_tier";
  const thresholdKm = Math.max(0, toNum(merged.thresholdKm, 4));
  const perKm = Math.max(0, toNum(merged.perKm, 0));
  const firstPerKm = Math.max(0, toNum(merged.rateFirstPerKm, perKm));
  const afterPerKm = Math.max(0, toNum(merged.rateAfterPerKm, perKm || firstPerKm));
  const tiers =
    kmModel === "single"
      ? [{ fromKm: 0, toKm: null, pricePerKmEur: perKm > 0 ? perKm : afterPerKm }]
      : [
          { fromKm: 0, toKm: thresholdKm, pricePerKmEur: firstPerKm },
          { fromKm: thresholdKm, toKm: null, pricePerKmEur: afterPerKm },
        ];
  const tripPerMinute = Math.max(0, toNum(merged.perMin, toNum(merged.pricePerMinute, 0)));
  const perSeconds = 10.91;
  const amountEur = tripPerMinute > 0 ? (tripPerMinute * perSeconds) / 60 : 0;
  const lvs = merged.largeVehicleSurcharge;
  const lvsObj = lvs && typeof lvs === "object" && !Array.isArray(lvs) ? (lvs as Record<string, unknown>) : {};
  return {
    regionId: serviceRegionId,
    version: toPositiveInt(merged.tariffVersion, opVersion),
    validFrom: typeof merged.validFrom === "string" && merged.validFrom.trim() ? merged.validFrom.trim() : null,
    baseFareEur: Math.max(0, toNum(merged.baseFare, 0)),
    minFareEur: Math.max(0, toNum(merged.minFare, toNum(merged.minPrice, 0))),
    kmTiers: tiers,
    timeTariff: {
      amountEur,
      perSeconds,
      perHourEur: Math.max(0, toNum(merged.waitingPerHour, tripPerMinute * 60)),
    },
    surcharges: {
      largeVehicleFromPassengers: toPositiveInt(lvsObj.minPassengers, 5),
      largeVehicleAmountEur: Math.max(0, toNum(lvsObj.amountEur, 0)),
    },
  };
}

export function bookingPriceToleranceEur(serverEur: number): number {
  const x = Number.isFinite(serverEur) ? Math.abs(serverEur) : 0;
  return Math.max(0.05, x * 0.015);
}

/**
 * Wenn der Client einen Schätzpreis mitschickt, muss er zur serverseitigen Engine passen (Anti-Tamper).
 * Fehlt der Wert, ist das ok (nur Server zählt).
 */
export function assertClientEstimatedFareMatchesServer(
  clientRaw: unknown,
  serverEur: number,
): { ok: true } | { ok: false; error: "estimate_mismatch" } {
  if (clientRaw == null) return { ok: true };
  const c = typeof clientRaw === "number" ? clientRaw : Number(clientRaw);
  if (!Number.isFinite(c)) return { ok: true };
  const tol = bookingPriceToleranceEur(serverEur);
  if (Math.abs(c - serverEur) > tol) return { ok: false, error: "estimate_mismatch" };
  return { ok: true };
}

export type RideBookingPricingResult = {
  pricingMode: RidePricingMode;
  operationalConfigVersion: number;
  serviceRegionId: string | null;
  finalPrice: number;
  estBook: ReturnType<typeof computeTaxiPriceLikeFareEstimate>["est"];
  snapshot: TariffBookingSnapshotV1;
};

/**
 * Einheitliche Buchungs-Preislogik: dieselbe Engine wie GET /fare-estimate, angereicherter Snapshot für Historie/Audit.
 */
export function computeRideBookingPricing(args: {
  opPayload: Record<string, unknown>;
  regions: ServiceRegionPublic[];
  fromFull: string;
  fromLat?: number | null;
  fromLon?: number | null;
  distanceKm: number;
  tripMinutes: number;
  waitingMinutes?: number;
  vehicle: string;
  at?: Date;
  applyHolidaySurcharge?: boolean;
  applyAirportFlat?: boolean;
  passengerCount?: number;
}): RideBookingPricingResult {
  const at = args.at ?? new Date();
  const waitingMinutes = args.waitingMinutes ?? 0;
  const { serviceRegionId, merged, est: estBook } = computeTaxiPriceLikeFareEstimate(args.opPayload, args.regions, {
    fromFull: args.fromFull,
    fromLat: args.fromLat,
    fromLon: args.fromLon,
    distanceKm: args.distanceKm,
    tripMinutes: args.tripMinutes,
    waitingMinutes,
    vehicle: args.vehicle,
    passengerCount: args.passengerCount,
    at,
    applyHolidaySurcharge: args.applyHolidaySurcharge ?? false,
    applyAirportFlat: args.applyAirportFlat ?? false,
  });
  const finalPrice = estBook.finalRounded;
  const operationalConfigVersion = operationalConfigVersionFromPayload(args.opPayload);
  const pricingMode = resolveRidePricingModeFromOperational(args.opPayload);
  const snapshot: TariffBookingSnapshotV1 = {
    engineSchemaVersion: TARIFF_ENGINE_SCHEMA_VERSION,
    serviceRegionId,
    finalPriceEur: finalPrice,
    subtotal: estBook.subtotal,
    afterMinFare: estBook.afterMinFare,
    breakdown: { ...estBook.breakdown },
    distanceKm: args.distanceKm,
    tripMinutes: args.tripMinutes,
    waitingMinutes,
    vehicle: args.vehicle,
    at: at.toISOString(),
    operationalConfigVersion,
    pricingMode,
    mergedTariffAudit: compactMergedTariffAudit(merged),
    meterTariffSnapshot: extractMeterTariffSnapshot(merged, serviceRegionId, operationalConfigVersion),
  };
  return {
    pricingMode,
    operationalConfigVersion,
    serviceRegionId,
    finalPrice,
    estBook,
    snapshot,
  };
}
