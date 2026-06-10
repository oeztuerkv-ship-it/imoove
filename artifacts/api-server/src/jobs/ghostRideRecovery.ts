import { and, desc, eq, inArray, isNotNull, lt } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import { getDb, isPostgresConfigured } from "../db/client";
import { getRideDriverLocation } from "../db/rideDriverLocationData";
import { insertSupplementalRideEvent, updateRide } from "../db/ridesData";
import { rideEventsTable, ridesTable } from "../db/schema";
import { isFarFutureReservation } from "../lib/dispatchStatus";
import { logger } from "../lib/logger";
import { broadcastRideStatusChange } from "../wsRideSocketHub";

const DEFAULT_IDLE_MINUTES = 15;
const DEFAULT_STALE_EXPIRE_HOURS = 8;

const STALE_EXPIRE_STATUSES: RideRequest["status"][] = [
  "searching_driver",
  "ready_for_dispatch",
  "in_progress",
];

function ghostIdleMs(): number {
  const raw = Number(process.env.ONRODA_GHOST_RIDE_IDLE_MINUTES ?? DEFAULT_IDLE_MINUTES);
  const minutes = Number.isFinite(raw) && raw >= 5 && raw <= 120 ? raw : DEFAULT_IDLE_MINUTES;
  return minutes * 60 * 1000;
}

function staleRideMaxAgeMs(): number {
  const raw = Number(process.env.ONRODA_STALE_RIDE_EXPIRE_HOURS ?? DEFAULT_STALE_EXPIRE_HOURS);
  const hours = Number.isFinite(raw) && raw >= 1 && raw <= 168 ? raw : DEFAULT_STALE_EXPIRE_HOURS;
  return hours * 60 * 60 * 1000;
}

/**
 * Offene Test-/Hänger-Fahrten (älter als 8h) → `expired`, damit sie nicht ewig in Listen bleiben.
 */
export async function expireStaleOpenRides(nowMs: number = Date.now()): Promise<string[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];

  const createdBefore = new Date(nowMs - staleRideMaxAgeMs());
  const rows = await db
    .select({
      id: ridesTable.id,
      status: ridesTable.status,
      createdAt: ridesTable.created_at,
    })
    .from(ridesTable)
    .where(
      and(
        inArray(ridesTable.status, STALE_EXPIRE_STATUSES),
        lt(ridesTable.created_at, createdBefore),
      ),
    );

  const expired: string[] = [];
  const staleHours = staleRideMaxAgeMs() / (60 * 60 * 1000);

  for (const row of rows) {
    const id = row.id?.trim();
    const fromStatus = row.status as RideRequest["status"];
    if (!id || !STALE_EXPIRE_STATUSES.includes(fromStatus)) continue;

    const updated = await updateRide(
      id,
      { status: "expired" },
      { mutationActor: { actorType: "system", actorId: null } },
    );
    if (!updated) continue;

    broadcastRideStatusChange(id, "expired", fromStatus);

    const pid = (updated.passengerId ?? "").trim();
    if (pid) {
      const { notifyPassengerReservationExpired } = await import("../lib/passengerRideExpoPush.js");
      void notifyPassengerReservationExpired(pid, id);
    }

    await insertSupplementalRideEvent(id, {
      eventType: "stale_ride_expired",
      fromStatus,
      toStatus: "expired",
      actorType: "system",
      actorId: null,
      payload: {
        staleAfterHours: staleHours,
        createdAt:
          row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? ""),
      },
    });

    expired.push(id);
    logger.warn(
      {
        rideId: id,
        fromStatus,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
        staleAfterHours: staleHours,
      },
      "[Cron] Stale open ride → expired",
    );
  }

  return expired;
}

/**
 * Fahrten in `accepted` ohne Fortschritt (kein frischer GPS-Ping) → zurück in den Suchpool.
 * Analog zu POST /rides/:id/driver-cancel, aber ohne rejectedBy (System-Recovery).
 */
export async function recoverGhostAcceptedRides(nowMs: number = Date.now()): Promise<string[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];

  const idleSince = new Date(nowMs - ghostIdleMs());

  const rows = await db
    .select({
      id: ridesTable.id,
      driverId: ridesTable.driver_id,
      companyId: ridesTable.company_id,
      scheduledAt: ridesTable.scheduled_at,
    })
    .from(ridesTable)
    .where(and(eq(ridesTable.status, "accepted"), isNotNull(ridesTable.driver_id)));

  const recovered: string[] = [];

  for (const row of rows) {
    const id = row.id?.trim();
    const driverId = typeof row.driverId === "string" ? row.driverId.trim() : "";
    if (!id || !driverId) continue;

    const acceptRows = await db
      .select({ created_at: rideEventsTable.created_at })
      .from(rideEventsTable)
      .where(and(eq(rideEventsTable.ride_id, id), eq(rideEventsTable.to_status, "accepted")))
      .orderBy(desc(rideEventsTable.created_at))
      .limit(1);
    const acceptedAt = acceptRows[0]?.created_at instanceof Date ? acceptRows[0].created_at : null;

    const dbLoc = await getRideDriverLocation(id);
    const locAt = dbLoc?.updatedAt ? new Date(dbLoc.updatedAt) : null;
    const referenceIdle =
      locAt && acceptedAt
        ? locAt > acceptedAt
          ? locAt
          : acceptedAt
        : locAt ?? acceptedAt;
    if (!referenceIdle || referenceIdle > idleSince) continue;

    const scheduledAtIso = row.scheduledAt instanceof Date ? row.scheduledAt.toISOString() : null;
    const revertStatus =
      scheduledAtIso && isFarFutureReservation(scheduledAtIso) ? ("scheduled" as const) : ("searching_driver" as const);

    const updated = await updateRide(
      id,
      { status: revertStatus, driverId: null },
      { mutationActor: { actorType: "system", actorId: null } },
    );
    if (!updated) continue;

    broadcastRideStatusChange(id, revertStatus, "accepted");

    await insertSupplementalRideEvent(id, {
      eventType: "ghost_ride_recovered",
      fromStatus: "accepted",
      toStatus: revertStatus,
      actorType: "system",
      actorId: null,
      payload: {
        previousDriverId: driverId,
        idleSinceMs: ghostIdleMs(),
        lastLocationAt: locAt?.toISOString() ?? null,
        acceptedAt: acceptedAt?.toISOString() ?? null,
      },
    });

    recovered.push(id);
    logger.warn(
      { rideId: id, driverId, revertStatus, referenceIdle: referenceIdle.toISOString() },
      "[Cron] Ghost-Ride → Pool",
    );
  }

  return recovered;
}
