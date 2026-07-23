import type { RideRequest } from "@/context/RideRequestContext";
import { isInstantOfferSnoozed } from "@/utils/instantOfferCountdown";

const DRIVER_MARKET_STATUSES = new Set<RideRequest["status"]>([
  "pending",
  "requested",
  "searching_driver",
  "offered",
]);

const DRIVER_BUSY_STATUSES = new Set<RideRequest["status"]>([
  "ready_for_dispatch",
  "accepted",
  "driver_arriving",
  "driver_waiting",
  "passenger_onboard",
  "arrived",
  "in_progress",
]);

const MAX_OFFER_AGE_HOURS = 8;

/** Gleiche Filter wie Fahrer-Dashboard — verhindert Klingeln für unsichtbare Alt-Pool-Fahrten. */
/** Laufende Fahrt dieses Fahrers — dann keine neuen Sofort-Angebote/Klingeln. */
export function driverHasActiveAssignedRide(reqs: RideRequest[], driverId: string): boolean {
  const did = driverId.trim();
  if (!did) return false;
  return reqs.some((r) => r.driverId === did && DRIVER_BUSY_STATUSES.has(r.status));
}

export function filterDriverInstantMarketOffers(
  reqs: RideRequest[],
  opts: {
    driverId: string;
    driverMarketOnline: boolean;
    suppressedIds?: ReadonlySet<string>;
    /** Keine Pool-Angebote, solange eine Fahrt läuft (Annahme → Ziel). */
    hideWhileOnActiveRide?: boolean;
  },
): RideRequest[] {
  const driverId = opts.driverId.trim();
  if (opts.hideWhileOnActiveRide && driverHasActiveAssignedRide(reqs, driverId)) {
    return [];
  }
  return reqs.filter((r) => {
    if (opts.suppressedIds?.has(r.id)) return false;
    if (isInstantOfferSnoozed(r.id)) return false;
    if (!opts.driverMarketOnline) return false;
    if (!DRIVER_MARKET_STATUSES.has(r.status)) return false;
    if (r.driverId) return false;
    if (driverId && (r.rejectedBy ?? []).includes(driverId)) return false;
    const createdMs = new Date(r.createdAt as Date | string).getTime();
    if (!Number.isFinite(createdMs)) return true;
    const ageHours = (Date.now() - createdMs) / (1000 * 60 * 60);
    return ageHours <= MAX_OFFER_AGE_HOURS;
  });
}

export function instantMarketOfferIdsKey(reqs: RideRequest[]): string {
  return reqs
    .map((r) => r.id)
    .sort()
    .join("|");
}

/** Offene Reservierungen im Planer-Pool — unabhängig vom ONLINE/OFFLINE-Toggle. */
export function filterDriverScheduledOpenOffers(
  pool: RideRequest[],
  opts: { driverId: string },
): RideRequest[] {
  const driverId = opts.driverId.trim();
  return pool.filter((r) => {
    if (r.status !== "scheduled") return false;
    if (r.driverId) return false;
    if (driverId && (r.rejectedBy ?? []).includes(driverId)) return false;
    return true;
  });
}
