import { and, eq, inArray, isNotNull, lt, lte } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "../db/client";
import { ridesTable } from "../db/schema";
import { broadcastRideStatusChange } from "../wsRideSocketHub";

export type ExpiredScheduledRow = { id: string; passenger_id: string | null };

/**
 * Aktiver Cron: `scheduled` mit Abholzeit in der Vergangenheit → `expired`.
 * Ersetzt den früheren Read-Pfad in `listRides` / `findRide`.
 */
export async function expirePastScheduledReservations(
  now: Date = new Date(),
): Promise<ExpiredScheduledRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .update(ridesTable)
    .set({ status: "expired" })
    .where(
      and(
        eq(ridesTable.status, "scheduled"),
        isNotNull(ridesTable.scheduled_at),
        lt(ridesTable.scheduled_at, now),
      ),
    )
    .returning({ id: ridesTable.id, passenger_id: ridesTable.passenger_id });

  for (const row of rows) {
    broadcastRideStatusChange(row.id, "expired", "scheduled");
  }

  return rows;
}

export type ExpiredAssignedRow = { id: string; passenger_id: string | null };

/** Aktiver Cron: `scheduled_assigned` mit Abholzeit in der Vergangenheit → `expired`. */
export async function expirePastAssignedReservations(
  now: Date = new Date(),
): Promise<ExpiredAssignedRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .update(ridesTable)
    .set({ status: "expired" })
    .where(
      and(
        eq(ridesTable.status, "scheduled_assigned"),
        isNotNull(ridesTable.scheduled_at),
        lt(ridesTable.scheduled_at, now),
      ),
    )
    .returning({ id: ridesTable.id, passenger_id: ridesTable.passenger_id });

  for (const row of rows) {
    broadcastRideStatusChange(row.id, "expired", "scheduled_assigned");
  }

  return rows;
}

export type ReactivatedScheduledRow = {
  id: string;
  passenger_id: string | null;
  driver_id: string | null;
  company_id: string | null;
};

/** Fahrer hat Aktivierung verpasst → zurück in Pool (`scheduled`, `driver_id` null). */
export async function releaseMissedActivationReservations(
  activationDeadline: Date,
): Promise<ReactivatedScheduledRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];

  const missed = await db
    .select({
      id: ridesTable.id,
      driver_id: ridesTable.driver_id,
      passenger_id: ridesTable.passenger_id,
      company_id: ridesTable.company_id,
    })
    .from(ridesTable)
    .where(
      and(
        eq(ridesTable.status, "scheduled_assigned"),
        isNotNull(ridesTable.scheduled_at),
        lte(ridesTable.scheduled_at, activationDeadline),
      ),
    );

  const missedIds = missed.map((r) => r.id).filter((id) => id.length > 0);
  if (missedIds.length === 0) return [];

  await db
    .update(ridesTable)
    .set({
      status: "scheduled",
      driver_id: null,
      push_driver_activation_reminder_at: null,
      push_customer_reservation_assigned_at: null,
    })
    .where(inArray(ridesTable.id, missedIds));

  for (const row of missed) {
    broadcastRideStatusChange(row.id, "scheduled", "scheduled_assigned");
  }

  return missed;
}
