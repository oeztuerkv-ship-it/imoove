import { eq } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import { getOperationalConfigPayload } from "./appOperationalData";
import { getDb, isPostgresConfigured } from "./client";
import { findRide, insertSupplementalRideEvent } from "./ridesData";
import { ridesTable } from "./schema";
import {
  dispatchTierForPhase,
  getDispatchTierTimeoutSec,
  isDispatchTierManagedRide,
  isOpenInstantRideForDispatch,
  nextDispatchPhase,
  normalizeDispatchPriority,
  resolveRideDispatchPhase,
  shouldAdvanceDispatchTierByTimeout,
  type DispatchPhase,
} from "../lib/dispatchPriorityTier";
import {
  notifyEligibleDriversScheduledPoolOffer,
  notifyMarketOnlineDriversInstantRideOffer,
} from "../lib/driverRideExpoPush";

async function loadDispatchTimeoutSec(): Promise<number> {
  const op = await getOperationalConfigPayload();
  const dispatch =
    op && typeof op.dispatch === "object" && op.dispatch
      ? (op.dispatch as Record<string, unknown>)
      : undefined;
  return getDispatchTierTimeoutSec(dispatch);
}

export async function advanceRideDispatchPhase(opts: {
  rideId: string;
  nextPhase: DispatchPhase;
  reason: "timeout" | "released" | "no_a_online";
  actorDriverId?: string;
}): Promise<RideRequest | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rid = opts.rideId.trim();
  if (!rid) return null;

  const cur = await findRide(rid);
  if (!cur || !isDispatchTierManagedRide(cur)) return cur;

  const fromPhase = resolveRideDispatchPhase(cur);
  const nextTier = dispatchTierForPhase(opts.nextPhase);
  const now = new Date();
  await db
    .update(ridesTable)
    .set({
      dispatch_phase: opts.nextPhase,
      dispatch_tier: nextTier,
      dispatch_tier_started_at: now,
    })
    .where(eq(ridesTable.id, rid));

  void insertSupplementalRideEvent(rid, {
    eventType: "dispatch_phase_advanced",
    fromStatus: cur.status,
    toStatus: cur.status,
    actorType: opts.reason === "released" ? "driver" : "system",
    actorId: opts.actorDriverId ?? null,
    payload: {
      fromPhase,
      toPhase: opts.nextPhase,
      fromTier: normalizeDispatchPriority(cur.dispatchTier ?? "A"),
      toTier: nextTier,
      reason: opts.reason,
    },
  });

  const updated = await findRide(rid);
  if (updated) {
    // Jede neue Phase (inkl. pool_2 / open): erneut Push an aktuell sichtbare Fahrer.
    void notifyMarketOnlineDriversInstantRideOffer(updated);
    void notifyEligibleDriversScheduledPoolOffer(updated);
  }
  return updated;
}

/** @deprecated Prefer advanceRideDispatchPhase — maps nextTier A|B onto phase. */
export async function advanceRideDispatchTier(opts: {
  rideId: string;
  nextTier: "A" | "B";
  reason: "timeout" | "released" | "no_a_online";
  actorDriverId?: string;
}): Promise<RideRequest | null> {
  const nextPhase: DispatchPhase = opts.nextTier === "A" ? "trio_a" : "pool_1";
  return advanceRideDispatchPhase({
    rideId: opts.rideId,
    nextPhase,
    reason: opts.reason,
    actorDriverId: opts.actorDriverId,
  });
}

/**
 * Trio A → Pool 1 → Pool 2 → open (je Default 10 s).
 * Kein Trio-A online → sofort pool_1. Phase `open` stoppt die Timed-Eskalation.
 */
export async function ensureRideDispatchTierCurrent(ride: RideRequest): Promise<{
  ride: RideRequest;
  advanced: boolean;
}> {
  if (!isDispatchTierManagedRide(ride)) return { ride, advanced: false };
  const phase = resolveRideDispatchPhase(ride);
  if (phase === "open") return { ride, advanced: false };

  const timeoutSec = await loadDispatchTimeoutSec();
  const byTimeout = shouldAdvanceDispatchTierByTimeout(ride, timeoutSec);

  let byNoAOnline = false;
  if (phase === "trio_a" && isOpenInstantRideForDispatch(ride)) {
    const { countMarketOnlineDriversWithDispatchPriority } = await import(
      "./fleetInstantRideMarketData.js"
    );
    const aOnline = await countMarketOnlineDriversWithDispatchPriority(ride, "A");
    byNoAOnline = aOnline === 0;
  }

  if (!byTimeout && !byNoAOnline) return { ride, advanced: false };

  const nxt = nextDispatchPhase(phase);
  if (!nxt) return { ride, advanced: false };

  const updated = await advanceRideDispatchPhase({
    rideId: ride.id,
    nextPhase: nxt,
    reason: byNoAOnline ? "no_a_online" : "timeout",
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

/** Trio A: Angebot freigeben → Pool-Runde 1. */
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

  const phase = resolveRideDispatchPhase(ride);
  if (phase !== "trio_a") return { ok: false, error: "release_only_trio_a" };

  const { getFleetDriverDispatchPriority } = await import("./fleetDriversData.js");
  const priority = await getFleetDriverDispatchPriority(did, cid);
  if (priority !== "A") return { ok: false, error: "driver_not_priority_a" };

  const nxt = nextDispatchPhase("trio_a");
  if (!nxt) return { ok: false, error: "no_next_phase" };

  const updated = await advanceRideDispatchPhase({
    rideId: rid,
    nextPhase: nxt,
    reason: "released",
    actorDriverId: did,
  });
  if (!updated) return { ok: false, error: "advance_failed" };
  return { ok: true, ride: updated };
}
