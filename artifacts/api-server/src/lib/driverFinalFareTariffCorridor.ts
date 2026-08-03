import type { RideRequest, TariffBookingSnapshotV1 } from "../domain/rideRequest";
import { estimateTaxiFromMergedTariff, resolveMergedTariff } from "./operationalTariffEngine";
import type { ServiceRegionPublic } from "../db/appOperationalData";

/** ±18 % um den aus Ist-km/Ist-Min. berechneten Engine-Preis (Taxameter-Eingabe). */
export const FINAL_FARE_TARIFF_CORRIDOR_RATIO = 0.18;

export type TariffCorridorOk = {
  ok: true;
  expectedFareEur: number;
  minAllowedEur: number;
  maxAllowedEur: number;
  baseFareEur: number;
};

export type TariffCorridorFail = {
  ok: false;
  error: "final_fare_below_base" | "final_fare_outside_tariff_corridor";
  message: string;
  expectedFareEur: number;
  minAllowedEur: number;
  maxAllowedEur: number;
  baseFareEur: number;
  driverEnteredFareEur: number;
  actualDistanceKm: number;
  actualDurationMinutes: number;
};

export type TariffCorridorResult = TariffCorridorOk | TariffCorridorFail;

function n(v: unknown, fallback = 0): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function roundMoney(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** Buchungs-Audit über Live-Tarif legen (Sätze vom Buchungszeitpunkt bevorzugen). */
export function overlayMergedTariffAudit(
  liveMerged: Record<string, unknown>,
  audit: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!audit || typeof audit !== "object" || Array.isArray(audit)) return liveMerged;
  return { ...liveMerged, ...audit };
}

export function inferBookingAirportFlat(snapshot: TariffBookingSnapshotV1 | null | undefined): boolean {
  return n(snapshot?.breakdown?.airportFlatEur, 0) > 0.009;
}

export function inferBookingHolidaySurcharge(snapshot: TariffBookingSnapshotV1 | null | undefined): boolean {
  const sur = snapshot?.breakdown?.surcharges;
  if (!Array.isArray(sur)) return false;
  return sur.some((s) => s && typeof s === "object" && String((s as { type?: unknown }).type) === "holiday");
}

export function resolveCorridorAtDate(
  snapshot: TariffBookingSnapshotV1 | null | undefined,
  tripStartedAtIso: string | null | undefined,
): Date {
  const fromSnap = snapshot?.at ? new Date(snapshot.at) : null;
  if (fromSnap && !Number.isNaN(fromSnap.getTime())) return fromSnap;
  const fromTrip = tripStartedAtIso ? new Date(tripStartedAtIso) : null;
  if (fromTrip && !Number.isNaN(fromTrip.getTime())) return fromTrip;
  return new Date();
}

/**
 * Taxameter-Eingabe vs. Engine mit Ist-km / GPS-Fahrtminuten / waitingMinutesBilled.
 *
 * `waitingMinutesBilled` fließt einmal in die Engine (wie bei der Schätzung).
 * Der Vergleich läuft gegen die **Fahrer-Eingabe** (vor dem serverseitigen
 * Addieren von `waitingChargeEur`) — GPS-Dauer wird nicht zusätzlich als Wartezeit genutzt.
 */
export function evaluateDriverFinalFareTariffCorridor(args: {
  driverEnteredFareEur: number;
  actualDistanceKm: number;
  actualDurationMinutes: number;
  waitingMinutesBilled: number;
  vehicle: string;
  at: Date;
  applyHolidaySurcharge: boolean;
  applyAirportFlat: boolean;
  passengerCount?: number;
  merged: Record<string, unknown>;
  /** Default: FINAL_FARE_TARIFF_CORRIDOR_RATIO (±18 %). Mid-Trip nutzt oft einen etwas weiteren Band. */
  corridorRatio?: number;
}): TariffCorridorResult {
  const entered = n(args.driverEnteredFareEur, NaN);
  if (!Number.isFinite(entered) || entered < 0) {
    return {
      ok: false,
      error: "final_fare_outside_tariff_corridor",
      message: "Ungültiger Taxameter-Preis.",
      expectedFareEur: 0,
      minAllowedEur: 0,
      maxAllowedEur: 0,
      baseFareEur: 0,
      driverEnteredFareEur: entered,
      actualDistanceKm: args.actualDistanceKm,
      actualDurationMinutes: args.actualDurationMinutes,
    };
  }

  const est = estimateTaxiFromMergedTariff(args.merged, {
    distanceKm: Math.max(0, args.actualDistanceKm),
    tripMinutes: Math.max(0, args.actualDurationMinutes),
    waitingMinutes: Math.max(0, args.waitingMinutesBilled),
    vehicle: args.vehicle.trim() || "standard",
    at: args.at,
    applyHolidaySurcharge: args.applyHolidaySurcharge,
    applyAirportFlat: args.applyAirportFlat,
    passengerCount: args.passengerCount,
  });

  const ratioRaw = args.corridorRatio;
  const ratio =
    typeof ratioRaw === "number" && Number.isFinite(ratioRaw) && ratioRaw > 0 && ratioRaw < 1
      ? ratioRaw
      : FINAL_FARE_TARIFF_CORRIDOR_RATIO;

  const expected = roundMoney(est.finalRounded);
  const baseFare = roundMoney(Math.max(0, n(est.breakdown.baseFare, 0)));
  const corridorMin = roundMoney(expected * (1 - ratio));
  const corridorMax = roundMoney(expected * (1 + ratio));
  /** Untergrenze: mind. Grundpreis und untere Korridorgrenze (was strenger ist). */
  const minAllowed = roundMoney(Math.max(baseFare, corridorMin));
  const maxAllowed = corridorMax;

  if (entered + 1e-9 < baseFare) {
    return {
      ok: false,
      error: "final_fare_below_base",
      message:
        `Der Taxameter-Preis (${entered.toFixed(2)} €) liegt unter dem Grundpreis (${baseFare.toFixed(2)} €). ` +
        "Bitte den Betrag vom Taxameter prüfen und korrigieren.",
      expectedFareEur: expected,
      minAllowedEur: minAllowed,
      maxAllowedEur: maxAllowed,
      baseFareEur: baseFare,
      driverEnteredFareEur: entered,
      actualDistanceKm: args.actualDistanceKm,
      actualDurationMinutes: args.actualDurationMinutes,
    };
  }

  if (entered + 1e-9 < minAllowed || entered > maxAllowed + 1e-9) {
    return {
      ok: false,
      error: "final_fare_outside_tariff_corridor",
      message:
        `Der Taxameter-Preis (${entered.toFixed(2)} €) passt nicht zum Tarif für diese Fahrt ` +
        `(erwartet ca. ${expected.toFixed(2)} €, erlaubt ${minAllowed.toFixed(2)}–${maxAllowed.toFixed(2)} € ` +
        `bei ${args.actualDistanceKm.toFixed(1)} km / ${args.actualDurationMinutes} Min.). ` +
        "Bitte den Betrag vom Taxameter prüfen und korrigieren.",
      expectedFareEur: expected,
      minAllowedEur: minAllowed,
      maxAllowedEur: maxAllowed,
      baseFareEur: baseFare,
      driverEnteredFareEur: entered,
      actualDistanceKm: args.actualDistanceKm,
      actualDurationMinutes: args.actualDurationMinutes,
    };
  }

  return {
    ok: true,
    expectedFareEur: expected,
    minAllowedEur: minAllowed,
    maxAllowedEur: maxAllowed,
    baseFareEur: baseFare,
  };
}

/** Hilfsfunktion für den Status-PATCH: Tarif laden + Korridor prüfen. */
export function evaluateRideCompletionTariffCorridor(args: {
  ride: RideRequest;
  driverEnteredFareEur: number;
  actualDistanceKm: number;
  actualDurationMinutes: number;
  opPayload: Record<string, unknown>;
  regions: ServiceRegionPublic[];
  corridorRatio?: number;
}): TariffCorridorResult {
  const snap = args.ride.tariffSnapshot ?? null;
  const { merged: liveMerged } = resolveMergedTariff(
    args.opPayload,
    args.regions,
    args.ride.fromFull ?? "",
    {
      lat:
        args.ride.fromLat != null && Number.isFinite(Number(args.ride.fromLat))
          ? Number(args.ride.fromLat)
          : null,
      lon:
        args.ride.fromLon != null && Number.isFinite(Number(args.ride.fromLon))
          ? Number(args.ride.fromLon)
          : null,
    },
  );
  const merged = overlayMergedTariffAudit(liveMerged, snap?.mergedTariffAudit ?? null);
  const waitingMinutesBilled = Math.max(0, n(args.ride.waitingMinutesBilled, 0));
  const vehicle =
    (typeof snap?.vehicle === "string" && snap.vehicle.trim()
      ? snap.vehicle.trim()
      : String(args.ride.vehicle ?? "").trim()) || "standard";

  return evaluateDriverFinalFareTariffCorridor({
    driverEnteredFareEur: args.driverEnteredFareEur,
    actualDistanceKm: args.actualDistanceKm,
    actualDurationMinutes: args.actualDurationMinutes,
    waitingMinutesBilled,
    vehicle,
    at: resolveCorridorAtDate(snap, args.ride.driverTripStartedAt),
    applyHolidaySurcharge: inferBookingHolidaySurcharge(snap),
    applyAirportFlat: inferBookingAirportFlat(snap),
    merged,
    corridorRatio: args.corridorRatio,
  });
}
