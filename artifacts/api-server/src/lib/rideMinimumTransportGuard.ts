import type { RideRequest } from "../domain/rideRequest";

/** Mindest-GPS-Strecke für positiven Endpreis nach Fahrtbeginn. */
export const MIN_BILLED_TRANSPORT_DISTANCE_KM = 0.5;

/** Mindest-Fahrzeit für positiven Endpreis nach Fahrtbeginn. */
export const MIN_BILLED_TRANSPORT_DURATION_MINUTES = 2;

export type MinimumTransportGuardFailure = {
  ok: false;
  error: "insufficient_transport_for_fare";
  message: string;
  actualDistanceKm: number | null;
  actualDurationMinutes: number | null;
};

export type MinimumTransportGuardResult = { ok: true } | MinimumTransportGuardFailure;

export function evaluateMinimumTransportForPositiveFare(
  metrics: { distanceKm: number; durationMinutes: number } | null,
  finalFareEur: number,
): MinimumTransportGuardResult {
  if (!Number.isFinite(finalFareEur) || finalFareEur <= 0.009) {
    return { ok: true };
  }

  const dist = metrics?.distanceKm ?? 0;
  const dur = metrics?.durationMinutes ?? 0;
  const insufficient =
    !metrics ||
    dist < MIN_BILLED_TRANSPORT_DISTANCE_KM ||
    dur < MIN_BILLED_TRANSPORT_DURATION_MINUTES;

  if (!insufficient) return { ok: true };

  const distLabel = metrics ? `${dist.toFixed(1).replace(".", ",")} km` : "—";
  const durLabel = metrics ? `${dur} Min.` : "—";

  return {
    ok: false,
    error: "insufficient_transport_for_fare",
    message:
      `Keine ausreichende Beförderung erkannt (${distLabel}, ${durLabel}). ` +
      "Für einen Fahrpreis sind mindestens 0,5 km und 2 Minuten Fahrzeit nötig. " +
      "Bitte mit 0,00 € abschließen (keine Beförderung) oder die Fahrt stornieren.",
    actualDistanceKm: metrics?.distanceKm ?? null,
    actualDurationMinutes: metrics?.durationMinutes ?? null,
  };
}

export async function computeRideCompletionGpsMetrics(
  rideId: string,
  cur: RideRequest,
  tripStartWaitingPatch?: Partial<RideRequest>,
  opts?: { windowEndAt?: Date | string | null },
): Promise<{ distanceKm: number; durationMinutes: number } | null> {
  let completedAt = new Date();
  const endRaw = opts?.windowEndAt;
  if (endRaw instanceof Date && !Number.isNaN(endRaw.getTime())) {
    completedAt = endRaw;
  } else if (typeof endRaw === "string" && endRaw.trim()) {
    const parsed = new Date(endRaw.trim());
    if (!Number.isNaN(parsed.getTime())) completedAt = parsed;
  }
  const tripStartedAtSource =
    cur.driverTripStartedAt ??
    (typeof tripStartWaitingPatch?.driverTripStartedAt === "string"
      ? tripStartWaitingPatch.driverTripStartedAt
      : null);
  const tripStartedAt = tripStartedAtSource ? new Date(tripStartedAtSource) : null;
  const { listRideLocationHistory } = await import("../db/rideLocationHistoryData.js");
  const { computeRideGpsTrackMetrics } = await import("./rideGpsTrackMetrics.js");
  const historyPoints = await listRideLocationHistory(rideId);
  return computeRideGpsTrackMetrics(
    historyPoints.map((p) => ({ lat: p.lat, lon: p.lon, recordedAt: p.recordedAt })),
    tripStartedAt,
    completedAt,
  );
}
