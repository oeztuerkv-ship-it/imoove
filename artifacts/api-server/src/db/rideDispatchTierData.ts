import { eq } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import { getOperationalConfigPayload } from "./appOperationalData";
import { getDb, isPostgresConfigured } from "./client";
import { findRide, insertSupplementalRideEvent } from "./ridesData";
import { ridesTable } from "./schema";
import {
  getDispatchTierTimeoutSec,
  isDispatchTierManagedRide,
  nextDispatchTier,
  normalizeDispatchPriority,
  shouldAdvanceDispatchTierByTimeout,
  type DispatchPriority,
} from "../lib/dispatchPriorityTier";
import { notifyMarketOnlineDriversInstantRideOffer } from "../lib/driverRideExpoPush";

async function loadDispatchTimeoutSec(): Promise<number> {
  const op = await getOperationalConfigPayload();
  const dispatch =
    op && typeof op.dispatch === "object" && op.dispatch
      ? (op.dispatch as Record<string, unknown>)
      : undefined;
  return getDispatchTierTimeoutSec(dispatch);
}

export async function advanceRideDispatchTier(opts: {
  rideId: string;
  nextTier: DispatchPriority;
  reason: "timeout" | "released";
  actorDriverId?: string;
}): Promise<RideRequest | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rid = opts.rideId.trim();
  if (!rid) return null;

  const cur = await findRide(rid);
  if (!cur || !isDispatchTierManagedRide(cur)) return cur;

  const now = new Date();
  await db
    .update(ridesTable)
    .set({
      dispatch_tier: opts.nextTier,
      dispatch_tier_started_at: now,
    })
    .where(eq(ridesTable.id, rid));

  void insertSupplementalRideEvent(rid, {
    eventType: "dispatch_tier_advanced",
    fromStatus: cur.status,
    toStatus: cur.status,
    actorType: opts.reason === "released" ? "driver" : "system",
    actorId: opts.actorDriverId ?? null,
    payload: {
      fromTier: normalizeDispatchPriority(cur.dispatchTier ?? "A"),
      toTier: opts.nextTier,
      reason: opts.reason,
    },
  });

  const updated = await findRide(rid);
  if (updated) void notifyMarketOnlineDriversInstantRideOffer(updated);
  return updated;
}

/** Timeout A→B oder B→C; bleibt auf C ohne weiteren Schritt. */
export async function ensureRideDispatchTierCurrent(ride: RideRequest): Promise<{
  ride: RideRequest;
  advanced: boolean;
}> {
  if (!isDispatchTierManagedRide(ride)) return { ride, advanced: false };
  const tier = normalizeDispatchPriority(ride.dispatchTier ?? "A");
  if (tier === "C") return { ride, advanced: false };

  const timeoutSec = await loadDispatchTimeoutSec();
  if (!shouldAdvanceDispatchTierByTimeout(ride, timeoutSec)) return { ride, advanced: false };

  const nxt = nextDispatchTier(tier);
  if (!nxt) return { ride, advanced: false };

  const updated = await advanceRideDispatchTier({
    rideId: ride.id,
    nextTier: nxt,
    reason: "timeout",
  });
  return { ride: updated ?? ride, advanced: Boolean(updated) };
}

export async function syncDispatchTiersForRides(rides: RideRequest[]): Promise<RideRequest[]> {
  const byId = new Map<string, RideRequest>();
  for (const r of rides) byId.set(r.id, r);

  const openIds = [
    ...new Set(
      rides.filter((r) => isDispatchTierManagedRide(r)).map((r) => r.id),
    ),
  ];
  for (const id of openIds) {
    const cur = byId.get(id);
    if (!cur) continue;
    const { ride } = await ensureRideDispatchTierCurrent(cur);
    byId.set(id, ride);
  }
  return rides.map((r) => byId.get(r.id) ?? r);
}

export async function releaseInstantRideDispatchOffer(opts: {
  rideId: string;
  fleetDriverId: string;
  companyId: string;
}): Promise<
  | { ok: true; ride: RideRequest }
  | { ok: false; error: string }
> {
  return releaseRideDispatchOffer(opts);
}

/** Premium A: Angebot freigeben → nächste Stufe (Sofortfahrt oder offene Reservierung). */
export async function releaseRideDispatchOffer(opts: {
  rideId: string;
  fleetDriverId: string;
  companyId: string;
}): Promise<
  | { ok: true; ride: RideRequest }
  | { ok: false; error: string }
> {
  const rid = opts.rideId.trim();
  const did = opts.fleetDriverId.trim();
  const cid = opts.companyId.trim();
  if (!rid || !did || !cid) return { ok: false, error: "invalid_input" };

  const ride = await findRide(rid);
  if (!ride) return { ok: false, error: "not_found" };
  if (!isDispatchTierManagedRide(ride)) return { ok: false, error: "ride_not_open" };

  const tier = normalizeDispatchPriority(ride.dispatchTier ?? "A");
  if (tier !== "A") return { ok: false, error: "release_only_tier_a" };

  const { getFleetDriverDispatchPriority } = await import("./fleetDriversData.js");
  const priority = await getFleetDriverDispatchPriority(did, cid);
  if (priority !== "A") return { ok: false, error: "driver_not_priority_a" };

  const nxt = nextDispatchTier("A");
  if (!nxt) return { ok: false, error: "no_next_tier" };

  const updated = await advanceRideDispatchTier({
    rideId: rid,
    nextTier: nxt,
    reason: "released",
    actorDriverId: did,
  });
  if (!updated) return { ok: false, error: "advance_failed" };
  return { ok: true, ride: updated };
}
