import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, ne, or } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import { getDb, isPostgresConfigured } from "./client";
import { insertSupplementalRideEvent, rowToRide } from "./ridesData";
import { rideDriverDispatchOffersTable, ridesTable } from "./schema";

const INSTANT_DISPATCH_STATUSES = new Set([
  "pending",
  "requested",
  "searching_driver",
  "offered",
]);

function makeDispatchOfferId(): string {
  return `RDO-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export type DispatchOfferRow = {
  rideId: string;
  fleetDriverId: string;
  companyId: string;
  sentAt: string;
  seenAt: string | null;
  acceptedAt: string | null;
};

/**
 * Markt-GET: für jede sichtbare Sofortfahrt `sent_at` setzen (offer_sent), einmalig mit Audit-Event.
 */
export async function recordDispatchOffersSentForDriver(
  fleetDriverId: string,
  companyId: string,
  rideIds: string[],
): Promise<void> {
  if (!isPostgresConfigured()) return;
  const db = getDb();
  if (!db) return;
  const did = fleetDriverId.trim();
  const cid = companyId.trim();
  if (!did || !cid) return;

  const uniqueRideIds = [...new Set(rideIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueRideIds.length === 0) return;

  for (const rideId of uniqueRideIds) {
    const existing = await db
      .select({ id: rideDriverDispatchOffersTable.id })
      .from(rideDriverDispatchOffersTable)
      .where(
        and(
          eq(rideDriverDispatchOffersTable.ride_id, rideId),
          eq(rideDriverDispatchOffersTable.fleet_driver_id, did),
        ),
      )
      .limit(1);

    const now = new Date();
    if (existing[0]) {
      await db
        .update(rideDriverDispatchOffersTable)
        .set({ company_id: cid })
        .where(eq(rideDriverDispatchOffersTable.id, existing[0].id));
      continue;
    }

    await db.insert(rideDriverDispatchOffersTable).values({
      id: makeDispatchOfferId(),
      ride_id: rideId,
      fleet_driver_id: did,
      company_id: cid,
      sent_at: now,
    });

    void insertSupplementalRideEvent(rideId, {
      eventType: "offer_sent",
      fromStatus: null,
      toStatus: null,
      actorType: "driver",
      actorId: did,
      payload: { fleetDriverId: did, companyId: cid },
    });
  }
}

/** Fahrer-App: Angebot im UI sichtbar (offer_seen). */
export async function recordDispatchOfferSeen(
  fleetDriverId: string,
  companyId: string,
  rideId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPostgresConfigured()) return { ok: false, error: "database_not_configured" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const did = fleetDriverId.trim();
  const cid = companyId.trim();
  const rid = rideId.trim();
  if (!did || !cid || !rid) return { ok: false, error: "invalid_input" };

  const rows = await db
    .select()
    .from(rideDriverDispatchOffersTable)
    .where(
      and(
        eq(rideDriverDispatchOffersTable.ride_id, rid),
        eq(rideDriverDispatchOffersTable.fleet_driver_id, did),
      ),
    )
    .limit(1);

  const now = new Date();
  let firstSeen = false;
  if (!rows[0]) {
    firstSeen = true;
    await db.insert(rideDriverDispatchOffersTable).values({
      id: makeDispatchOfferId(),
      ride_id: rid,
      fleet_driver_id: did,
      company_id: cid,
      sent_at: now,
      seen_at: now,
    });
  } else if (!rows[0].seen_at) {
    firstSeen = true;
    await db
      .update(rideDriverDispatchOffersTable)
      .set({ seen_at: now, company_id: cid })
      .where(eq(rideDriverDispatchOffersTable.id, rows[0].id));
  }

  if (firstSeen) {
    void insertSupplementalRideEvent(rid, {
      eventType: "offer_seen",
      actorType: "driver",
      actorId: did,
      payload: { fleetDriverId: did, companyId: cid },
    });
  }

  return { ok: true };
}

export async function markDispatchOfferAccepted(fleetDriverId: string, rideId: string): Promise<void> {
  if (!isPostgresConfigured()) return;
  const db = getDb();
  if (!db) return;
  const did = fleetDriverId.trim();
  const rid = rideId.trim();
  if (!did || !rid) return;

  const now = new Date();
  await db
    .update(rideDriverDispatchOffersTable)
    .set({ accepted_at: now })
    .where(
      and(
        eq(rideDriverDispatchOffersTable.ride_id, rid),
        eq(rideDriverDispatchOffersTable.fleet_driver_id, did),
      ),
    );
}

/** Admin/Analytics: Fahrer die Angebot gesehen aber nicht angenommen haben. */
export async function listDispatchOffersForRide(rideId: string): Promise<DispatchOfferRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const rid = rideId.trim();
  if (!rid) return [];
  const rows = await db
    .select()
    .from(rideDriverDispatchOffersTable)
    .where(eq(rideDriverDispatchOffersTable.ride_id, rid));
  return rows.map((r) => ({
    rideId: r.ride_id,
    fleetDriverId: r.fleet_driver_id,
    companyId: r.company_id,
    sentAt: r.sent_at.toISOString(),
    seenAt: r.seen_at?.toISOString() ?? null,
    acceptedAt: r.accepted_at?.toISOString() ?? null,
  }));
}

export function isInstantDispatchRideStatus(status: string): boolean {
  return INSTANT_DISPATCH_STATUSES.has(status);
}

const MISSED_TERMINAL_STATUSES = new Set<string>([
  "completed",
  "cancelled",
  "cancelled_by_customer",
  "cancelled_by_driver",
  "cancelled_by_system",
  "expired",
]);

export type MissedRideReason = "rejected" | "taken_by_other" | "closed";

export type MissedRideOfferRow = {
  rideId: string;
  offeredAt: string;
  seenAt: string | null;
  missedReason: MissedRideReason;
  ride: RideRequest;
};

/**
 * Verpasst = Offer gesendet, nicht angenommen, Chance vorbei
 * (explizit abgelehnt | anderer Fahrer | terminaler Status).
 */
export function classifyMissedRideOpportunity(
  ride: Pick<RideRequest, "status" | "driverId" | "rejectedBy">,
  fleetDriverId: string,
): MissedRideReason | null {
  const did = fleetDriverId.trim();
  if (!did) return null;
  const assigned = typeof ride.driverId === "string" ? ride.driverId.trim() : "";
  if (assigned === did) return null;
  if ((ride.rejectedBy ?? []).map((id) => String(id).trim()).includes(did)) return "rejected";
  if (assigned.length > 0 && assigned !== did) return "taken_by_other";
  if (MISSED_TERMINAL_STATUSES.has(String(ride.status ?? ""))) return "closed";
  return null;
}

/** Offene Angebote dieses Fahrers, deren Chance vorbei ist (für „Verpasste Fahrten“). */
export async function listMissedDispatchOffersForDriver(
  fleetDriverId: string,
  companyId: string,
  limit = 100,
): Promise<MissedRideOfferRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const did = fleetDriverId.trim();
  const cid = companyId.trim();
  if (!did || !cid) return [];

  const cap = Math.min(Math.max(1, Math.floor(limit)), 200);
  const rows = await db
    .select({
      offer: rideDriverDispatchOffersTable,
      ride: ridesTable,
    })
    .from(rideDriverDispatchOffersTable)
    .innerJoin(ridesTable, eq(ridesTable.id, rideDriverDispatchOffersTable.ride_id))
    .where(
      and(
        eq(rideDriverDispatchOffersTable.fleet_driver_id, did),
        eq(rideDriverDispatchOffersTable.company_id, cid),
        isNull(rideDriverDispatchOffersTable.accepted_at),
        or(isNull(ridesTable.driver_id), ne(ridesTable.driver_id, did)),
      ),
    )
    .orderBy(desc(rideDriverDispatchOffersTable.sent_at))
    .limit(cap * 2);

  const out: MissedRideOfferRow[] = [];
  for (const row of rows) {
    const ride = rowToRide(row.ride);
    const reason = classifyMissedRideOpportunity(ride, did);
    if (!reason) continue;
    out.push({
      rideId: ride.id,
      offeredAt: row.offer.sent_at.toISOString(),
      seenAt: row.offer.seen_at?.toISOString() ?? null,
      missedReason: reason,
      ride,
    });
    if (out.length >= cap) break;
  }
  return out;
}
