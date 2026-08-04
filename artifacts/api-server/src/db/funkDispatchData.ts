/**
 * Funk-Dispatch: Owner weist Sofortfahrt exclusiv dem nächstgelegenen ONLINE-Fahrer zu.
 * Kein Markt-Pool, kein Tier A/B — bei Ablehnung/Timeout Kette zum Nächsten.
 */
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import { haversineDistanceKm } from "../lib/serviceRegionMatch";
import { getDb, isPostgresConfigured } from "./client";
import { getFleetDriverCapability, isRideCompatibleWithCapability } from "./fleetMatchingData";
import { getFleetDriverReadinessById } from "./fleetDriverReadiness";
import { findRide, insertSupplementalRideEvent, listAdminRideEventsByRideId, listRides, updateRide } from "./ridesData";
import { fleetDriversTable, ridesTable } from "./schema";
import { listFleetDriversForCompany } from "./fleetDriversData";
import { notifyDriverFunkOffer } from "../lib/driverRideExpoPush";
import { logger } from "../lib/logger";
import { funkCreatorFleetDriverId } from "../lib/funkDispatchCoords";

export const FUNK_OFFER_TIMEOUT_MS = 45_000;
/** GPS älter als 3 Min. zählt nicht als „nächstgelegen“. */
export const FUNK_GPS_FRESH_MS = 3 * 60_000;

const FUNK_OPEN_STATUSES = new Set<RideRequest["status"]>([
  "searching_driver",
  "offered",
  "pending",
  "requested",
]);

const FUNK_BUSY_STATUSES = new Set<string>([
  "accepted",
  "driver_arriving",
  "driver_waiting",
  "arrived",
  "in_progress",
  "passenger_onboard",
  "customer_abort_pending_fare",
  "ready_for_dispatch",
  "scheduled_assigned",
]);

export function isFunkDispatchRide(ride: Pick<RideRequest, "dispatchMode">): boolean {
  return (ride.dispatchMode ?? "market") === "funk";
}

export { funkCreatorFleetDriverId } from "../lib/funkDispatchCoords";

export type FunkCandidate = {
  fleetDriverId: string;
  companyId: string;
  distanceKm: number;
  lat: number;
  lon: number;
};

async function listBusyDriverIds(companyId: string): Promise<Set<string>> {
  const busy = new Set<string>();
  if (!isPostgresConfigured()) {
    for (const r of await listRides()) {
      const did = (r.driverId ?? "").trim();
      if (!did) continue;
      if ((r.companyId ?? "").trim() !== companyId) continue;
      if (FUNK_BUSY_STATUSES.has(r.status)) busy.add(did);
    }
    return busy;
  }
  const db = getDb();
  if (!db) return busy;
  const rows = await db
    .select({ driverId: ridesTable.driver_id })
    .from(ridesTable)
    .where(
      and(
        eq(ridesTable.company_id, companyId),
        isNotNull(ridesTable.driver_id),
        inArray(ridesTable.status, [...FUNK_BUSY_STATUSES]),
      ),
    );
  for (const row of rows) {
    const id = String(row.driverId ?? "").trim();
    if (id) busy.add(id);
  }
  return busy;
}

/** ONLINE + ready + GPS frisch + nicht busy + Capability — sortiert nach Haversine zum Abholort. */
export async function listFunkCandidatesRanked(ride: RideRequest): Promise<FunkCandidate[]> {
  const companyId = (ride.companyId ?? "").trim();
  const pickupLat = ride.fromLat;
  const pickupLon = ride.fromLon;
  if (!companyId || pickupLat == null || pickupLon == null) return [];
  if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLon)) return [];

  const rejected = new Set((ride.rejectedBy ?? []).map((id) => String(id).trim()).filter(Boolean));
  /** Owner, der den Funk-Auftrag angelegt hat — nie anbieten (kein Eigen-Klingeln). */
  const creatorId = funkCreatorFleetDriverId(ride);
  if (creatorId) rejected.add(creatorId);
  const busy = await listBusyDriverIds(companyId);
  const now = Date.now();

  const db = getDb();
  if (!db || !isPostgresConfigured()) return [];

  const rows = await db
    .select({
      id: fleetDriversTable.id,
      companyId: fleetDriversTable.company_id,
      lat: fleetDriversTable.last_market_lat,
      lon: fleetDriversTable.last_market_lon,
      at: fleetDriversTable.last_market_at,
    })
    .from(fleetDriversTable)
    .where(
      and(
        eq(fleetDriversTable.company_id, companyId),
        eq(fleetDriversTable.is_market_online, true),
        eq(fleetDriversTable.is_active, true),
        eq(fleetDriversTable.access_status, "active"),
        eq(fleetDriversTable.approval_status, "approved"),
        isNotNull(fleetDriversTable.last_market_lat),
        isNotNull(fleetDriversTable.last_market_lon),
      ),
    );

  const out: FunkCandidate[] = [];
  for (const row of rows) {
    const fleetDriverId = String(row.id ?? "").trim();
    const co = String(row.companyId ?? "").trim();
    if (!fleetDriverId || !co) continue;
    if (rejected.has(fleetDriverId)) continue;
    if (busy.has(fleetDriverId)) continue;
    const lat = row.lat;
    const lon = row.lon;
    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const atMs = row.at ? new Date(row.at).getTime() : NaN;
    if (!Number.isFinite(atMs) || now - atMs > FUNK_GPS_FRESH_MS) continue;

    const readiness = await getFleetDriverReadinessById(fleetDriverId, co);
    if ("error" in readiness || !readiness.ready) continue;
    const capability = await getFleetDriverCapability(fleetDriverId, co);
    if (!capability?.vehicleLegalType) continue;
    if (!isRideCompatibleWithCapability(ride, capability)) continue;

    const distanceKm = haversineDistanceKm(lat, lon, pickupLat, pickupLon);
    out.push({ fleetDriverId, companyId: co, distanceKm, lat, lon });
  }

  out.sort((a, b) => a.distanceKm - b.distanceKm);
  return out;
}

async function markFunkExhausted(ride: RideRequest, reason: string): Promise<RideRequest | null> {
  const updated = await updateRide(
    ride.id,
    {
      status: "no_driver",
      offeredToDriverId: null,
      funkOfferStartedAt: null,
      driverId: null,
    },
    { mutationActor: { actorType: "system", actorId: "funk_dispatch" } },
  );
  await insertSupplementalRideEvent(ride.id, {
    eventType: "funk_exhausted",
    fromStatus: ride.status,
    toStatus: "no_driver",
    actorType: "system",
    actorId: null,
    payload: { reason },
  });
  return updated;
}

async function offerFunkToDriver(
  ride: RideRequest,
  candidate: FunkCandidate,
  eventType: "funk_offer" | "funk_fallback",
): Promise<RideRequest | null> {
  const nowIso = new Date().toISOString();
  const updated = await updateRide(
    ride.id,
    {
      status: "offered",
      offeredToDriverId: candidate.fleetDriverId,
      funkOfferStartedAt: nowIso,
      driverId: null,
    },
    { mutationActor: { actorType: "system", actorId: "funk_dispatch" } },
  );
  if (!updated) return null;
  await insertSupplementalRideEvent(ride.id, {
    eventType,
    fromStatus: ride.status,
    toStatus: "offered",
    actorType: "system",
    actorId: candidate.fleetDriverId,
    payload: {
      driverId: candidate.fleetDriverId,
      distanceKm: Math.round(candidate.distanceKm * 100) / 100,
    },
  });
  void notifyDriverFunkOffer(candidate.fleetDriverId, candidate.companyId, ride.id, candidate.distanceKm).catch(
    (err) => logger.warn({ err, rideId: ride.id }, "notifyDriverFunkOffer failed"),
  );
  return updated;
}

/**
 * Startet Funk-Kette nach Panel-Create.
 * @returns updated ride; status `no_driver` wenn niemand verfügbar.
 */
export async function startFunkDispatch(ride: RideRequest): Promise<RideRequest> {
  if (!isFunkDispatchRide(ride)) return ride;
  if (!FUNK_OPEN_STATUSES.has(ride.status) && ride.status !== "offered") {
    return ride;
  }
  const candidates = await listFunkCandidatesRanked(ride);
  if (candidates.length === 0) {
    const exhausted = await markFunkExhausted(ride, "no_candidates");
    return exhausted ?? ride;
  }
  const next = await offerFunkToDriver(ride, candidates[0]!, "funk_offer");
  return next ?? ride;
}

/**
 * Nach Ablehnung oder Timeout: nächsten Kandidaten anbieten oder Exhaustion.
 */
export async function advanceFunkDispatch(
  rideId: string,
  opts?: { reason?: "reject" | "timeout"; rejectingDriverId?: string },
): Promise<RideRequest | null> {
  const ride = await findRide(rideId);
  if (!ride || !isFunkDispatchRide(ride)) return ride;
  if (!FUNK_OPEN_STATUSES.has(ride.status) && ride.status !== "offered") return ride;
  if (ride.driverId && ride.status === "accepted") return ride;

  const rejectingId = (opts?.rejectingDriverId ?? ride.offeredToDriverId ?? "").trim();
  if (opts?.reason === "timeout" && rejectingId) {
    await insertSupplementalRideEvent(ride.id, {
      eventType: "funk_timeout",
      fromStatus: ride.status,
      toStatus: ride.status,
      actorType: "system",
      actorId: rejectingId,
      payload: {
        driverId: rejectingId,
        outcome: "timeout",
        timeoutMs: FUNK_OFFER_TIMEOUT_MS,
      },
    });
  }

  let rejectedBy = [...(ride.rejectedBy ?? [])];
  if (rejectingId && !rejectedBy.includes(rejectingId)) {
    rejectedBy = [...rejectedBy, rejectingId];
  }

  const withReject: RideRequest = {
    ...ride,
    rejectedBy,
    offeredToDriverId: null,
    funkOfferStartedAt: null,
  };

  await updateRide(
    ride.id,
    {
      rejectedBy,
      offeredToDriverId: null,
      funkOfferStartedAt: null,
      status: ride.status === "offered" ? "searching_driver" : ride.status,
    },
    { mutationActor: { actorType: "system", actorId: "funk_dispatch" } },
  );

  const refreshed = (await findRide(ride.id)) ?? withReject;
  const candidates = await listFunkCandidatesRanked(refreshed);
  if (candidates.length === 0) {
    return markFunkExhausted(refreshed, opts?.reason === "timeout" ? "timeout_exhausted" : "reject_exhausted");
  }
  return offerFunkToDriver(refreshed, candidates[0]!, "funk_fallback");
}

/** Cron: Funk-Angebote nach 45 s Timeout weiterreichen. */
export async function runFunkDispatchTimeoutTick(now: Date = new Date()): Promise<number> {
  if (!isPostgresConfigured()) return 0;
  const db = getDb();
  if (!db) return 0;
  const cutoff = new Date(now.getTime() - FUNK_OFFER_TIMEOUT_MS);
  const rows = await db
    .select({ id: ridesTable.id })
    .from(ridesTable)
    .where(
      and(
        eq(ridesTable.dispatch_mode, "funk"),
        inArray(ridesTable.status, ["offered", "searching_driver"]),
        isNotNull(ridesTable.funk_offer_started_at),
        sql`${ridesTable.funk_offer_started_at} <= ${cutoff}`,
      ),
    );
  let n = 0;
  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    try {
      await advanceFunkDispatch(id, { reason: "timeout" });
      n += 1;
    } catch (err) {
      logger.warn({ err, rideId: id }, "funk timeout advance failed");
    }
  }
  return n;
}

export type FunkTimelineStep = {
  at: string;
  outcome: "offered" | "rejected" | "timeout" | "accepted" | "exhausted";
  driverId: string | null;
  driverName: string | null;
  distanceKm: number | null;
};

function driverDisplayName(firstName: string, lastName: string, fallbackId: string): string {
  const name = `${firstName} ${lastName}`.trim();
  return name || fallbackId;
}

/**
 * Funk-Verlauf aus `ride_events` (kein neues Schema).
 * Kette: angeboten → abgelehnt/Timeout → … → angenommen | erschöpft.
 */
export async function buildFunkDispatchTimeline(rideId: string): Promise<{
  steps: FunkTimelineStep[];
  summaryLine: string;
}> {
  const ride = await findRide(rideId);
  if (!ride || !isFunkDispatchRide(ride)) {
    return { steps: [], summaryLine: "" };
  }
  const companyId = (ride.companyId ?? "").trim();
  const nameById = new Map<string, string>();
  if (companyId) {
    for (const d of await listFleetDriversForCompany(companyId)) {
      nameById.set(d.id, driverDisplayName(d.firstName, d.lastName, d.id));
    }
  }
  const events = await listAdminRideEventsByRideId(rideId);
  const steps: FunkTimelineStep[] = [];
  for (const ev of events) {
    const payload = ev.payload ?? {};
    const payloadDriver =
      typeof payload.driverId === "string"
        ? payload.driverId.trim()
        : typeof ev.actorId === "string"
          ? ev.actorId.trim()
          : "";
    if (ev.eventType === "funk_offer" || ev.eventType === "funk_fallback") {
      const distanceKm =
        typeof payload.distanceKm === "number" && Number.isFinite(payload.distanceKm)
          ? payload.distanceKm
          : null;
      steps.push({
        at: ev.createdAt,
        outcome: "offered",
        driverId: payloadDriver || null,
        driverName: payloadDriver ? (nameById.get(payloadDriver) ?? payloadDriver) : null,
        distanceKm,
      });
      continue;
    }
    if (ev.eventType === "driver_rejected") {
      steps.push({
        at: ev.createdAt,
        outcome: "rejected",
        driverId: payloadDriver || null,
        driverName: payloadDriver ? (nameById.get(payloadDriver) ?? payloadDriver) : null,
        distanceKm: null,
      });
      continue;
    }
    if (ev.eventType === "funk_timeout") {
      steps.push({
        at: ev.createdAt,
        outcome: "timeout",
        driverId: payloadDriver || null,
        driverName: payloadDriver ? (nameById.get(payloadDriver) ?? payloadDriver) : null,
        distanceKm: null,
      });
      continue;
    }
    if (ev.eventType === "funk_exhausted") {
      steps.push({
        at: ev.createdAt,
        outcome: "exhausted",
        driverId: null,
        driverName: null,
        distanceKm: null,
      });
      continue;
    }
    if (
      ev.eventType === "ride_status_changed" &&
      ev.toStatus === "accepted" &&
      (ev.actorType === "driver" || Boolean((ride.driverId ?? "").trim()))
    ) {
      const did = (payloadDriver || (ride.driverId ?? "").trim()) || null;
      steps.push({
        at: ev.createdAt,
        outcome: "accepted",
        driverId: did,
        driverName: did ? (nameById.get(did) ?? did) : null,
        distanceKm: null,
      });
    }
  }

  const parts = steps.map((s) => {
    const t = new Date(s.at);
    const clock = Number.isNaN(t.getTime())
      ? ""
      : t.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    const name = s.driverName ?? s.driverId ?? "—";
    if (s.outcome === "offered") return `${name} (angeboten${clock ? `, ${clock}` : ""})`;
    if (s.outcome === "rejected") return `${name} (abgelehnt${clock ? `, ${clock}` : ""})`;
    if (s.outcome === "timeout") return `${name} (keine Reaktion${clock ? `, ${clock}` : ""})`;
    if (s.outcome === "accepted") return `${name} (angenommen${clock ? `, ${clock}` : ""})`;
    return `Keine Fahrer${clock ? ` (${clock})` : ""}`;
  });
  return {
    steps,
    summaryLine: parts.length > 0 ? `Funk-Verlauf: ${parts.join(" → ")}` : "Funk-Verlauf: noch keine Schritte",
  };
}
