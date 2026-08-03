import type { RideRequest } from "../domain/rideRequest";
import {
  evaluateFinalFarePlausibility,
  maxAllowedFinalFareEur,
} from "./driverFinalFarePlausibility";
import type { TariffCorridorResult } from "./driverFinalFareTariffCorridor";

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

/** Etwas weiter als Vollabschluss (±18 %), weil Abbruch-Taxameter oft kurz + unruhig ist. */
export const MID_TRIP_ABORT_CORRIDOR_RATIO = 0.25;

/** Unter dieser Distanz gilt der Track allein nicht als „brauchbar“ (Dauer kann retten). */
export const MID_TRIP_USABLE_GPS_MIN_DISTANCE_KM = 0.05;

/** Absolute Sanity-Untergrenze der Obergrenze ohne GPS (Anti-Tippfehler 999 €). */
export const MID_TRIP_NO_GPS_ABS_CAP_FLOOR_EUR = 150;

/**
 * GPS-Fensterende für Mid-Trip-Metriken: Abbruchzeitpunkt, sonst jetzt
 * (Finalize kann Minuten später kommen — Dauer nicht aufblähen).
 */
export function resolveMidTripAbortGpsWindowEnd(
  customerMidTripAbortAt: string | null | undefined,
  now: Date = new Date(),
): Date {
  const raw = typeof customerMidTripAbortAt === "string" ? customerMidTripAbortAt.trim() : "";
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return now;
}

export function isUsableMidTripGpsTrack(
  metrics: { distanceKm: number; durationMinutes: number } | null | undefined,
): boolean {
  if (!metrics) return false;
  const dist = Number(metrics.distanceKm);
  const dur = Number(metrics.durationMinutes);
  if (!Number.isFinite(dist) || !Number.isFinite(dur)) return false;
  return dist >= MID_TRIP_USABLE_GPS_MIN_DISTANCE_KM || dur >= 1;
}

/**
 * Ohne brauchbaren GPS-Track: Obergrenze = Plausibilitäts-Cap der Buchungsschätzung,
 * mind. {@link MID_TRIP_NO_GPS_ABS_CAP_FLOOR_EUR}. Kein harter Tarif-Korridor.
 */
export function midTripAbortAbsoluteFareCapEur(bookingEstimatedFareEur: number): number {
  const fromEst = maxAllowedFinalFareEur(bookingEstimatedFareEur);
  if (!Number.isFinite(fromEst)) return MID_TRIP_NO_GPS_ABS_CAP_FLOOR_EUR;
  return Math.max(MID_TRIP_NO_GPS_ABS_CAP_FLOOR_EUR, fromEst);
}

export type MidTripAbortTaximeterOk = {
  ok: true;
  flooredEur: number;
  expectedFareEur: number | null;
  mode: "gps_corridor" | "no_gps_abs_cap";
  plausibilityFlagged: boolean;
  actualDistanceKm: number | null;
  actualDurationMinutes: number | null;
};

export type MidTripAbortTaximeterFail = {
  ok: false;
  error:
    | "final_fare_below_base"
    | "final_fare_outside_tariff_corridor"
    | "final_fare_plausibility_failed"
    | "final_fare_above_absolute_cap";
  message: string;
  flooredEur: number;
  expectedFareEur: number | null;
  minAllowedFinalFareEur?: number;
  maxAllowedFinalFareEur?: number;
  baseFareEur?: number;
  ratio?: number;
  actualDistanceKm: number | null;
  actualDurationMinutes: number | null;
  bookingEstimatedFareEur: number;
  minimumFareEur: number;
};

export type MidTripAbortTaximeterResult = MidTripAbortTaximeterOk | MidTripAbortTaximeterFail;

/**
 * Taxameter-Prüfung für Mid-Trip-Abbruch.
 * - Mit brauchbarem GPS: Engine-Expected aus Ist-km/Ist-min + Korridor; Plausibilität gegen Expected.
 * - Ohne GPS: nur Mindestfahrpreis + Absolute-Obergrenze (kein Block gegen Vollstrecken-Schätzung).
 */
export function evaluateMidTripAbortTaximeterFare(args: {
  enteredEur: number;
  minFareEur: number;
  bookingEstimatedFareEur: number;
  gpsMetrics: { distanceKm: number; durationMinutes: number } | null;
  plausibilityAck: boolean;
  /** Vorberechneter Korridor (nur wenn GPS brauchbar); sonst null. */
  corridor: TariffCorridorResult | null;
}): MidTripAbortTaximeterResult {
  const floored = applyMinimumFareFloorEur(args.enteredEur, args.minFareEur);
  const bookingEst = Number(args.bookingEstimatedFareEur);
  const bookingEstimatedFareEur = Number.isFinite(bookingEst) && bookingEst > 0 ? bookingEst : 0;
  const usable = isUsableMidTripGpsTrack(args.gpsMetrics);
  const actualDistanceKm = usable ? args.gpsMetrics!.distanceKm : null;
  const actualDurationMinutes = usable ? args.gpsMetrics!.durationMinutes : null;

  if (usable && args.corridor) {
    const corridor = args.corridor;
    if (!corridor.ok) {
      return {
        ok: false,
        error: corridor.error,
        message: corridor.message,
        flooredEur: floored,
        expectedFareEur: corridor.expectedFareEur,
        minAllowedFinalFareEur: corridor.minAllowedEur,
        maxAllowedFinalFareEur: corridor.maxAllowedEur,
        baseFareEur: corridor.baseFareEur,
        actualDistanceKm: corridor.actualDistanceKm,
        actualDurationMinutes: corridor.actualDurationMinutes,
        bookingEstimatedFareEur,
        minimumFareEur: args.minFareEur,
      };
    }

    const expected = corridor.expectedFareEur;
    const plausibility = evaluateFinalFarePlausibility(expected, floored);
    if (!plausibility.ok && !args.plausibilityAck) {
      return {
        ok: false,
        error: "final_fare_plausibility_failed",
        message:
          `Der eingegebene Preis weicht stark vom Tarif für die bisher gefahrene Strecke ` +
          `(ca. ${expected.toFixed(2)} € bei ${Number(actualDistanceKm ?? 0).toFixed(1)} km / ` +
          `${actualDurationMinutes ?? 0} Min.) ab. Max. ohne Bestätigung: ${plausibility.maxAllowedEur.toFixed(2)} €. ` +
          "Taxameter-Preis erneut prüfen oder bestätigen.",
        flooredEur: floored,
        expectedFareEur: expected,
        maxAllowedFinalFareEur: plausibility.maxAllowedEur,
        ratio: plausibility.ratio,
        actualDistanceKm,
        actualDurationMinutes,
        bookingEstimatedFareEur,
        minimumFareEur: args.minFareEur,
      };
    }

    return {
      ok: true,
      flooredEur: floored,
      expectedFareEur: expected,
      mode: "gps_corridor",
      plausibilityFlagged: Boolean(plausibility.ok && plausibility.flagged),
      actualDistanceKm,
      actualDurationMinutes,
    };
  }

  const absCap = midTripAbortAbsoluteFareCapEur(bookingEstimatedFareEur);
  if (floored > absCap + 1e-9) {
    return {
      ok: false,
      error: "final_fare_above_absolute_cap",
      message:
        `Ohne brauchbaren GPS-Track ist höchstens ${absCap.toFixed(2)} € zulässig. ` +
        "Bitte den Taxameter-Betrag prüfen.",
      flooredEur: floored,
      expectedFareEur: null,
      maxAllowedFinalFareEur: absCap,
      actualDistanceKm: null,
      actualDurationMinutes: null,
      bookingEstimatedFareEur,
      minimumFareEur: args.minFareEur,
    };
  }

  return {
    ok: true,
    flooredEur: floored,
    expectedFareEur: null,
    mode: "no_gps_abs_cap",
    plausibilityFlagged: false,
    actualDistanceKm: null,
    actualDurationMinutes: null,
  };
}
