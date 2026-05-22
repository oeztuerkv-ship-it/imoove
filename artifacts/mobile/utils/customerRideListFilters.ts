import type { RequestStatus, RideRequest } from "@/context/RideRequestContext";

/** Offene Sofort-Suche — nach Stunden ausblenden (keine Geister in Badge/Liste). */
const MAX_OPEN_DISPATCH_AGE_HOURS = 8;

const IN_PROGRESS_STATUSES = new Set<RequestStatus>([
  "ready_for_dispatch",
  "accepted",
  "driver_arriving",
  "driver_waiting",
  "passenger_onboard",
  "arrived",
  "in_progress",
]);

const OPEN_DISPATCH_STATUSES = new Set<RequestStatus>([
  "pending",
  "requested",
  "searching_driver",
  "offered",
]);

/** Echte Stornos — kein Fahrer-Ablehnen (`rejected`) oder Markt-Timeout (`expired`). */
export const CUSTOMER_CANCELLED_STATUSES = new Set<RequestStatus>([
  "cancelled",
  "cancelled_by_customer",
  "cancelled_by_driver",
  "cancelled_by_system",
]);

export function isCustomerCancelledStatus(status: RequestStatus): boolean {
  return CUSTOMER_CANCELLED_STATUSES.has(status);
}

function rideCreatedAtMs(createdAt: Date | string | undefined): number {
  if (createdAt instanceof Date) return createdAt.getTime();
  if (typeof createdAt === "string") {
    const t = new Date(createdAt).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

export function isRecentCustomerOpenDispatchRide(
  createdAt: Date | string | undefined,
  maxHours = MAX_OPEN_DISPATCH_AGE_HOURS,
): boolean {
  const t = rideCreatedAtMs(createdAt);
  if (t <= 0) return true;
  return Date.now() - t <= maxHours * 60 * 60 * 1000;
}

/** Reservierung oder laufende Fahrt (nicht Sofort-Anfrage). */
export function isCustomerActiveRide(r: RideRequest): boolean {
  const st = r.status;
  if (st === "scheduled" || st === "scheduled_assigned") return true;
  if (IN_PROGRESS_STATUSES.has(st)) return true;
  if (OPEN_DISPATCH_STATUSES.has(st)) {
    return isRecentCustomerOpenDispatchRide(r.createdAt);
  }
  return false;
}

/** Offene Sofort-Fahrtanfrage (Suche / Angebot) — Badge Tab „Fahrten“. */
export function isCustomerRideRequest(r: RideRequest): boolean {
  return (
    OPEN_DISPATCH_STATUSES.has(r.status) && isRecentCustomerOpenDispatchRide(r.createdAt)
  );
}

/** Nur aktuelle Fahrtanfragen zählen — keine Reservierungen, keine laufende Fahrt. */
export function countCustomerFahrtenBadge(rides: RideRequest[]): number {
  return rides.filter(isCustomerRideRequest).length;
}

/** Aktive Vorbestellungen (Kunden-Tab „Fahrten“ / Reservierungen). */
export function isCustomerActiveReservation(r: RideRequest): boolean {
  return r.status === "scheduled" || r.status === "scheduled_assigned";
}

export function countCustomerReservationBadge(rides: RideRequest[]): number {
  return rides.filter(isCustomerActiveReservation).length;
}
