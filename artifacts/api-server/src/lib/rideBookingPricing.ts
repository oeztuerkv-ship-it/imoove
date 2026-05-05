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
  const t = isTariffsObject(op);
  const pm = t.pricingMode;
  if (pm === "fixed_price" || pm === "hybrid" || pm === "taxi_tariff") return pm;
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
  ] as const;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(merged, k)) out[k] = merged[k];
  }
  return out;
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
