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
  "customer_abort_pending_fare",
]);

export function isCustomerCancelledStatus(status: RequestStatus): boolean {
  return CUSTOMER_CANCELLED_STATUSES.has(status);
}

/** Sofort-Suche / Markt (Fahrer hat abgesagt → gleiche rideId, neuer Pool). */
export function isCustomerOpenDispatchStatus(status: RequestStatus): boolean {
  return OPEN_DISPATCH_STATUSES.has(status);
}

/** Endgültiges Storno — Kunde verlässt Live-Fahrt zur Startseite (nicht Szenario C). */
export function isCustomerFinalCancelledStatus(status: RequestStatus): boolean {
  return (
    status === "cancelled_by_driver" ||
    status === "cancelled_by_customer" ||
    status === "cancelled_by_system"
  );
}

/** Kunde brach nach Fahrtstart ab — Fahrer muss noch Taxameter eingeben. */
export function isCustomerAbortPendingFareStatus(status: RequestStatus | string): boolean {
  return status === "customer_abort_pending_fare";
}

/** Kunde verlässt Live-Status (final oder Mid-Trip-Pending mit Abrechnung folgt). */
export function isCustomerLiveRideEndedStatus(status: RequestStatus): boolean {
  return isCustomerFinalCancelledStatus(status) || isCustomerAbortPendingFareStatus(status);
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

const TERMINAL_OR_PAST_STATUSES = new Set<RequestStatus>([
  "completed",
  "cancelled",
  "cancelled_by_customer",
  "cancelled_by_driver",
  "cancelled_by_system",
  "customer_abort_pending_fare",
  "expired",
  "rejected",
]);

/** Laufende Sofortfahrt / Fahrersuche (nicht Reservierung). */
export function isCustomerRideActiveNow(r: RideRequest): boolean {
  if (!isCustomerActiveRide(r)) return false;
  if (isCustomerActiveReservation(r)) return false;
  return true;
}

/** Geplante Reservierung — Tab „Zukunft“. */
export function isCustomerRideFuture(r: RideRequest): boolean {
  return isCustomerActiveReservation(r);
}

export function isCustomerRidePastStatus(status: RequestStatus | string): boolean {
  return TERMINAL_OR_PAST_STATUSES.has(status as RequestStatus);
}

/** Abgelaufene Sofort-Anfrage (nicht mehr in „Aktuell“). */
export function isCustomerStaleOpenDispatch(r: RideRequest): boolean {
  return isCustomerOpenDispatchStatus(r.status) && !isRecentCustomerOpenDispatchRide(r.createdAt);
}

export function customerRideListDateKey(
  createdAt: Date | string,
  scheduledAt?: Date | string | null,
): string {
  const raw = scheduledAt ?? createdAt;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (!Number.isFinite(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function customerRideRequestMatchesSearch(r: RideRequest, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [r.id, r.from, r.to, r.fromFull, r.toFull, r.customerName, r.billingReference]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function customerPlainRideMatchesSearch(
  ride: { id: string; from?: string; to?: string; origin?: string; destination?: string },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [ride.id, ride.from, ride.to, ride.origin, ride.destination]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function customerRideSegmentOf(r: RideRequest): "aktuell" | "zukunft" | "abgelaufen" {
  if (isCustomerRideActiveNow(r)) return "aktuell";
  if (isCustomerRideFuture(r)) return "zukunft";
  return "abgelaufen";
}
