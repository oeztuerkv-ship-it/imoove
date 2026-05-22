import type { RideRequest } from "@/context/RideRequestContext";

const DRIVER_MARKET_STATUSES = new Set<RideRequest["status"]>([
  "pending",
  "requested",
  "searching_driver",
  "offered",
]);

const MAX_OFFER_AGE_HOURS = 8;

/** Gleiche Filter wie Fahrer-Dashboard — verhindert Klingeln für unsichtbare Alt-Pool-Fahrten. */
export function filterDriverInstantMarketOffers(
  reqs: RideRequest[],
  opts: {
    driverId: string;
    driverMarketOnline: boolean;
    suppressedIds?: ReadonlySet<string>;
  },
): RideRequest[] {
  const driverId = opts.driverId.trim();
  return reqs.filter((r) => {
    if (opts.suppressedIds?.has(r.id)) return false;
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
