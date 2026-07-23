import type { RideRequest } from "@/context/RideRequestContext";
import { getApiBaseUrl } from "@/utils/apiBase";
import {
  clearSoftMissStash,
  getSoftMissStash,
  listSoftMissStash,
  stashSoftMissRide,
} from "@/utils/instantOfferCountdown";

export { stashSoftMissRide, clearSoftMissStash, getSoftMissStash };

/** Stash-Fahrten in den Sofortpool mischen (A→B hat sie ggf. aus market-rides entfernt). */
export function mergeSoftMissStashIntoOffers(
  pool: RideRequest[],
  opts: { driverId: string; suppressedIds?: ReadonlySet<string> },
): RideRequest[] {
  const driverId = opts.driverId.trim();
  const byId = new Map(pool.map((r) => [r.id, r]));
  for (const ride of listSoftMissStash<RideRequest>()) {
    if (opts.suppressedIds?.has(ride.id)) continue;
    if (driverId && (ride.rejectedBy ?? []).includes(driverId)) continue;
    if (!byId.has(ride.id)) byId.set(ride.id, ride);
  }
  return [...byId.values()];
}

/** Server: Fahrt noch offen (ohne Tier-Filter) — für Soft-Miss-Wake. */
export async function fetchSoftMissOpen(opts: {
  authToken: string;
  rideId: string;
}): Promise<"open" | "closed" | "unknown"> {
  const base = getApiBaseUrl();
  const token = opts.authToken.trim();
  const rideId = opts.rideId.trim();
  if (!base || !token || !rideId) return "unknown";
  try {
    const res = await fetch(
      `${base}/fleet-driver/v1/rides/${encodeURIComponent(rideId)}/soft-miss-open`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
        cache: "no-store",
      },
    );
    if (res.status === 404) return "unknown";
    if (!res.ok) return "closed";
    const body = (await res.json().catch(() => null)) as { open?: unknown } | null;
    return body?.open === true ? "open" : "closed";
  } catch {
    return "unknown";
  }
}
