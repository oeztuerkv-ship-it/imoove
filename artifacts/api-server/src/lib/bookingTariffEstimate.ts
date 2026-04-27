import type { ServiceRegionPublic } from "../db/appOperationalData";
import { estimateTaxiFromMergedTariff, resolveMergedTariff } from "./operationalTariffEngine";

/** Muss mit /fare-estimate `engineSchemaVersion` übereinstimmen. */
export const TARIFF_ENGINE_SCHEMA_VERSION = 2 as const;

/**
 * Einheitliche Taxameter-Schätzung für Kunden:
 * GET /api/fare-estimate und POST /api/rides (Buchung) — dieselbe Engine, dieselben Eingaben.
 */
export function computeTaxiPriceLikeFareEstimate(
  opPayload: Record<string, unknown>,
  regions: ServiceRegionPublic[],
  p: {
    fromFull: string;
    distanceKm: number;
    tripMinutes: number;
    waitingMinutes: number;
    vehicle: string;
    at: Date;
    applyHolidaySurcharge?: boolean;
    applyAirportFlat?: boolean;
  },
): {
  serviceRegionId: string | null;
  merged: Record<string, unknown>;
  est: ReturnType<typeof estimateTaxiFromMergedTariff>;
} {
  const { merged, serviceRegionId } = resolveMergedTariff(opPayload, regions, p.fromFull);
  const est = estimateTaxiFromMergedTariff(merged, {
    distanceKm: p.distanceKm,
    tripMinutes: p.tripMinutes,
    waitingMinutes: p.waitingMinutes,
    vehicle: p.vehicle,
    at: p.at,
    applyHolidaySurcharge: p.applyHolidaySurcharge ?? false,
    applyAirportFlat: p.applyAirportFlat ?? false,
  });
  return { serviceRegionId, merged, est };
}
