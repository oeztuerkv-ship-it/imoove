import type { RideRequest } from "../domain/rideRequest";
import { estimatePickupEtaMinutes } from "./ridePickupEta";
import { notifyPassengerDriverEtaMinutes } from "./passengerRideExpoPush";

const ETA_PUSH_THRESHOLDS_MIN = [15, 10, 8, 5, 3, 1] as const;

/** rideId → bereits gesendete Schwellen (Minuten). */
const pushedEtaThresholds = new Map<string, Set<number>>();

const ACTIVE_PICKUP_STATUSES = new Set<RideRequest["status"]>([
  "accepted",
  "driver_arriving",
  "ready_for_dispatch",
]);

function clearEtaPushStateForRide(rideId: string): void {
  pushedEtaThresholds.delete(rideId.trim());
}

/**
 * Bei Fahrer-GPS-Update: Push „Dein Fahrer ist in ca. X Min entfernt“ (Schwellen, je einmal pro Fahrt).
 * Bevorzugt Straßen-ETA aus dem Navi (`etaMinutes`), sonst Luftlinien-Fallback.
 */
export async function maybeNotifyPassengerPickupEtaFromDriverLocation(
  ride: RideRequest,
  driverLat: number,
  driverLon: number,
  navEtaMinutes?: number | null,
): Promise<void> {
  const rideId = ride.id.trim();
  const passengerId = (ride.passengerId ?? "").trim();
  if (!rideId || !passengerId) return;
  if (!ACTIVE_PICKUP_STATUSES.has(ride.status)) {
    clearEtaPushStateForRide(rideId);
    return;
  }

  const pickupLat = ride.fromLat;
  const pickupLon = ride.fromLon;
  if (pickupLat == null || pickupLon == null) return;
  if (!Number.isFinite(driverLat) || !Number.isFinite(driverLon)) return;

  const etaMin =
    typeof navEtaMinutes === "number" && Number.isFinite(navEtaMinutes) && navEtaMinutes >= 0
      ? Math.max(1, Math.round(navEtaMinutes) || 1)
      : estimatePickupEtaMinutes(driverLat, driverLon, pickupLat, pickupLon);
  let sent = pushedEtaThresholds.get(rideId);
  if (!sent) {
    sent = new Set();
    pushedEtaThresholds.set(rideId, sent);
  }

  for (const threshold of ETA_PUSH_THRESHOLDS_MIN) {
    if (etaMin > threshold) continue;
    if (sent.has(threshold)) continue;
    sent.add(threshold);
    await notifyPassengerDriverEtaMinutes(passengerId, rideId, etaMin);
    break;
  }
}

export function resetPassengerEtaPushState(rideId: string): void {
  clearEtaPushStateForRide(rideId);
}
