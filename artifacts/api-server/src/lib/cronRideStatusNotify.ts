import {
  notifyPassengerReservationActivated,
  notifyPassengerReservationDispatchStarted,
  notifyPassengerReservationExpired,
  notifyPassengerReservationReopenedToMarket,
  notifyPassengerRideCancelledBySystem,
  shouldNotifyPassengerReservationExpired,
} from "./passengerRideExpoPush";
import { broadcastRideStatusChange } from "../wsRideSocketHub";

/** WebSocket + passende Expo-Push nach Cron-/Lifecycle-Statuswechsel (Passagier). */
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
  /** Manuelle Fahrer-Aktivierung: Live-Tracking freigeschaltet. */
  if (toStatus === "ready_for_dispatch" && fromStatus === "scheduled_assigned") {
    void notifyPassengerReservationActivated(pid, rideId);
    return;
  }
  /** Cron Job 4: offene Reservierung → Markt / Fahrersuche. */
  if (toStatus === "searching_driver" && fromStatus === "scheduled") {
    void notifyPassengerReservationDispatchStarted(pid, rideId);
    return;
  }
  /** Verpasste Aktivierung: Zuweisung weg → erneut Markt. */
  if (toStatus === "searching_driver" && fromStatus === "scheduled_assigned") {
    void notifyPassengerReservationReopenedToMarket(pid, rideId);
  }
}
