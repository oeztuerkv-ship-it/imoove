import type { RequestStatus, RideRequest } from "@/context/RideRequestContext";

/** Kunde: nach App-Start direkt auf Status-Screen (vom Server). */
export const CUSTOMER_SESSION_RESTORE_STATUSES = new Set<RequestStatus>([
  "pending",
  "requested",
  "searching_driver",
  "offered",
  "accepted",
  "driver_arriving",
  "driver_waiting",
  "ready_for_dispatch",
  "passenger_onboard",
  "arrived",
  "in_progress",
]);

/** Fahrer: aktive Fahrt im Dashboard (vom Server). */
export const DRIVER_SESSION_RESTORE_STATUSES = new Set<RequestStatus>([
  "accepted",
  "driver_arriving",
  "driver_waiting",
  "in_progress",
  "ready_for_dispatch",
  "passenger_onboard",
  "arrived",
]);

function rideCreatedAtMs(createdAt: Date | string | undefined): number {
  if (createdAt instanceof Date) return createdAt.getTime();
  if (typeof createdAt === "string") {
    const t = new Date(createdAt).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

export function pickNewestRideForSessionRestore(
  rides: RideRequest[],
  statuses: Set<RequestStatus>,
  filter?: (r: RideRequest) => boolean,
): RideRequest | null {
  const matching = rides.filter((r) => statuses.has(r.status) && (!filter || filter(r)));
  if (matching.length === 0) return null;
  return [...matching].sort((a, b) => rideCreatedAtMs(b.createdAt) - rideCreatedAtMs(a.createdAt))[0] ?? null;
}

/**
 * GET /customer/v1/rides ist bereits passagier-gebunden.
 * passengerId-Filter bevorzugt; Fallback ohne Filter falls ID lokal noch nicht gesetzt.
 */
export function pickCustomerSessionRestoreRide(
  rides: RideRequest[],
  passengerId: string,
): RideRequest | null {
  const pid = passengerId.trim();
  if (pid) {
    const matched = pickNewestRideForSessionRestore(
      rides,
      CUSTOMER_SESSION_RESTORE_STATUSES,
      (r) => (typeof r.passengerId === "string" ? r.passengerId.trim() : "") === pid,
    );
    if (matched) return matched;
  }
  return pickNewestRideForSessionRestore(rides, CUSTOMER_SESSION_RESTORE_STATUSES);
}

export function pickDriverSessionRestoreRide(
  rides: RideRequest[],
  driverId: string,
): RideRequest | null {
  const did = driverId.trim();
  if (!did) return null;
  return pickNewestRideForSessionRestore(
    rides,
    DRIVER_SESSION_RESTORE_STATUSES,
    (r) => (typeof r.driverId === "string" ? r.driverId.trim() : "") === did,
  );
}
