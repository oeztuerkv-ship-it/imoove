import { insertSupplementalRideEvent } from "../db/ridesData";
import type { RideRequest } from "../domain/rideRequest";

/** Audit bei fehlgeschlagenem Geofence / Fake-Ankunft (Grundlage Anti-Fraud). */
export async function logRideAntiFraudAttempt(
  rideId: string,
  input: {
    eventType: "fake_arrival_attempt" | "trip_start_geofence_blocked";
    fromStatus: RideRequest["status"];
    targetStatus: RideRequest["status"];
    actorType: string;
    actorId: string | null;
    error: string;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await insertSupplementalRideEvent(rideId, {
    eventType: input.eventType,
    fromStatus: input.fromStatus,
    toStatus: input.targetStatus,
    actorType: input.actorType,
    actorId: input.actorId,
    payload: {
      error: input.error,
      ...(input.details ?? {}),
    },
  });
}
