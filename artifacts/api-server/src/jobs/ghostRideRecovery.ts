import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "../db/client";
import { getRideDriverLocation } from "../db/rideDriverLocationData";
import { insertSupplementalRideEvent, updateRide } from "../db/ridesData";
import { rideEventsTable, ridesTable } from "../db/schema";
import { isFarFutureReservation } from "../lib/dispatchStatus";
import { logger } from "../lib/logger";

const DEFAULT_IDLE_MINUTES = 15;

function ghostIdleMs(): number {
  const raw = Number(process.env.ONRODA_GHOST_RIDE_IDLE_MINUTES ?? DEFAULT_IDLE_MINUTES);
  const minutes = Number.isFinite(raw) && raw >= 5 && raw <= 120 ? raw : DEFAULT_IDLE_MINUTES;
  return minutes * 60 * 1000;
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
