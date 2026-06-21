import {
  notifyPassengerReservationExpired,
  notifyPassengerRideCancelledBySystem,
  shouldNotifyPassengerReservationExpired,
} from "./passengerRideExpoPush";
import { broadcastRideStatusChange } from "../wsRideSocketHub";

/** WebSocket + passende Expo-Push nach Cron-Statuswechsel (Passagier). */
export function notifyCronRideStatusChange(input: {
  rideId: string;
  fromStatus: string;
  toStatus: string;
  passengerId?: string | null;
}): void {
  const rideId = input.rideId.trim();
  const fromStatus = input.fromStatus.trim();
  const toStatus = input.toStatus.trim();
  if (!rideId || !toStatus) return;

  broadcastRideStatusChange(rideId, toStatus, fromStatus || undefined);

  const pid = typeof input.passengerId === "string" ? input.passengerId.trim() : "";
  if (!pid) return;

  if (toStatus === "expired" && shouldNotifyPassengerReservationExpired(fromStatus)) {
    void notifyPassengerReservationExpired(pid, rideId);
    return;
  }
  if (toStatus === "cancelled_by_system") {
    void notifyPassengerRideCancelledBySystem(pid, rideId);
    return;
  }
}
