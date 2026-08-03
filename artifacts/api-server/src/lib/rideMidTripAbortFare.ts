import type { RideRequest } from "../domain/rideRequest";

/**
 * Mindestfahrpreis für Mid-Trip-Abbruch / Taxameter-Untergrenze.
 * Snapshot `minFareEur` → Snapshot `baseFareEur` → 0.
 */
export function resolveRideMinimumFareEur(ride: Pick<RideRequest, "tariffSnapshot">): number {
  const snap = ride.tariffSnapshot;
  const fromBreakdown = snap?.breakdown?.minFare;
  if (typeof fromBreakdown === "number" && Number.isFinite(fromBreakdown) && fromBreakdown > 0) {
    return Math.round((fromBreakdown + Number.EPSILON) * 100) / 100;
  }
  const meter = snap?.meterTariffSnapshot;
  const fromMeterMin = meter?.minFareEur;
  if (typeof fromMeterMin === "number" && Number.isFinite(fromMeterMin) && fromMeterMin > 0) {
    return Math.round((fromMeterMin + Number.EPSILON) * 100) / 100;
  }
  const fromMeterBase = meter?.baseFareEur;
  if (typeof fromMeterBase === "number" && Number.isFinite(fromMeterBase) && fromMeterBase > 0) {
    return Math.round((fromMeterBase + Number.EPSILON) * 100) / 100;
  }
  const audit = snap?.mergedTariffAudit;
  if (audit && typeof audit === "object") {
    const minRaw = (audit as Record<string, unknown>).minFare ?? (audit as Record<string, unknown>).minPrice;
    const minN = typeof minRaw === "number" ? minRaw : Number(minRaw);
    if (Number.isFinite(minN) && minN > 0) {
      return Math.round((minN + Number.EPSILON) * 100) / 100;
    }
    const baseRaw = (audit as Record<string, unknown>).baseFare;
    const baseN = typeof baseRaw === "number" ? baseRaw : Number(baseRaw);
    if (Number.isFinite(baseN) && baseN > 0) {
      return Math.round((baseN + Number.EPSILON) * 100) / 100;
    }
  }
  return 0;
}

/** Eingabe anheben auf Mindestfahrpreis (nie unter die Untergrenze). */
export function applyMinimumFareFloorEur(enteredEur: number, minFareEur: number): number {
  const entered = Number(enteredEur);
  const min = Number(minFareEur);
  if (!Number.isFinite(entered) || entered < 0) return Number.isFinite(min) && min > 0 ? min : 0;
  if (!Number.isFinite(min) || min <= 0) {
    return Math.round((entered + Number.EPSILON) * 100) / 100;
  }
  return Math.round((Math.max(entered, min) + Number.EPSILON) * 100) / 100;
}

export function isCustomerAbortPendingFareStatus(status: string): boolean {
  return status === "customer_abort_pending_fare";
}

export function isMidTripCustomerAbort(ride: Pick<RideRequest, "status" | "customerMidTripAbortAt">): boolean {
  if (ride.customerMidTripAbortAt) return true;
  return isCustomerAbortPendingFareStatus(String(ride.status ?? ""));
}
