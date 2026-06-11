import type { RideRequest } from "../domain/rideRequest";

/**
 * Zentrale Ride-State-Machine (Betrieb/Cloud-Architektur).
 * Persistente Status bleiben in `rides.status`; feinere Schritte → `ride_events` (z. B. navigation_started).
 */
export const RIDE_TERMINAL_STATUSES: ReadonlySet<RideRequest["status"]> = new Set([
  "completed",
  "no_show",
  "cancelled_by_customer",
  "cancelled_by_driver",
  "cancelled_by_system",
  "cancelled",
  "rejected",
  "expired",
]);

/** Kartenzahlung (Stripe PaymentIntent): alle aktiven Buchungs-/Fahrt-Stati, nicht nur Terminal-Gegenteil. */
export const RIDE_PAYMENT_ALLOWED_STATUSES: ReadonlySet<RideRequest["status"]> = new Set([
  "draft",
  "scheduled",
  "scheduled_assigned",
  "ready_for_dispatch",
  "requested",
  "searching_driver",
  "offered",
  "pending",
  "accepted",
  "driver_arriving",
  "driver_waiting",
  "passenger_onboard",
  "arrived",
  "in_progress",
]);

export function isPaymentAllowedForRideStatus(status: RideRequest["status"]): boolean {
  return RIDE_PAYMENT_ALLOWED_STATUSES.has(status);
}

const TRANSITIONS: Partial<Record<RideRequest["status"], RideRequest["status"][]>> = {
  draft: ["requested", "cancelled_by_customer", "cancelled"],
  scheduled: [
    "accepted",
    "scheduled_assigned",
    "ready_for_dispatch",
    "searching_driver",
    "cancelled_by_customer",
    "cancelled",
    "expired",
  ],
  scheduled_assigned: [
    "ready_for_dispatch",
    "driver_arriving",
    "driver_waiting",
    "passenger_onboard",
    "cancelled_by_customer",
    "cancelled_by_driver",
    "cancelled_by_system",
    "cancelled",
    "expired",
  ],
  ready_for_dispatch: [
    "driver_arriving",
    "driver_waiting",
    "passenger_onboard",
    "in_progress",
    "cancelled_by_customer",
    "cancelled_by_driver",
    "cancelled_by_system",
    "cancelled",
    "expired",
  ],
  requested: ["searching_driver", "offered", "accepted", "expired", "cancelled_by_customer", "cancelled"],
  searching_driver: ["offered", "accepted", "expired", "cancelled_by_customer", "cancelled"],
  offered: ["accepted", "searching_driver", "expired", "cancelled_by_customer", "cancelled"],
  pending: [
    "accepted",
    "driver_arriving",
    "driver_waiting",
    "in_progress",
    "completed",
    "cancelled",
    "rejected",
    "cancelled_by_customer",
    "cancelled_by_driver",
    "cancelled_by_system",
  ],
  accepted: [
    "driver_arriving",
    "driver_waiting",
    "passenger_onboard",
    "cancelled_by_customer",
    "cancelled_by_driver",
    "cancelled_by_system",
    "cancelled",
  ],
  driver_arriving: [
    "driver_waiting",
    "passenger_onboard",
    "in_progress",
    "cancelled_by_customer",
    "cancelled_by_driver",
    "cancelled_by_system",
  ],
  driver_waiting: [
    "passenger_onboard",
    "in_progress",
    "no_show",
    "cancelled_by_customer",
    "cancelled_by_driver",
    "cancelled_by_system",
  ],
  passenger_onboard: ["completed", "cancelled_by_system"],
  arrived: ["passenger_onboard", "completed", "cancelled", "cancelled_by_customer", "cancelled_by_driver"],
  in_progress: ["completed", "cancelled_by_system", "cancelled", "expired"],
};

export function canTransitionRideStatus(from: RideRequest["status"], to: RideRequest["status"]): boolean {
  if (from === to) return true;
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** Ops-Events (Audit), ohne neuen DB-Status. */
export function supplementalEventForTransition(
  from: RideRequest["status"],
  to: RideRequest["status"],
): { eventType: string; payload?: Record<string, unknown> } | null {
  if (to === "accepted" && from !== "accepted") {
    return { eventType: "offer_accepted" };
  }
  if (to === "driver_arriving" && from !== "driver_arriving") {
    return { eventType: "navigation_started" };
  }
  if (to === "driver_waiting" && from !== "driver_waiting") {
    return { eventType: "geofenced_arrival" };
  }
  if (to === "in_progress" && from !== "in_progress") {
    return { eventType: "trip_started" };
  }
  if (to === "completed" && from !== "completed") {
    return { eventType: "ride_completed" };
  }
  if (to === "no_show" && from !== "no_show") {
    return { eventType: "passenger_no_show" };
  }
  return null;
}
