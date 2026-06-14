import { and, eq, gt, inArray, isNotNull, lt, lte } from "drizzle-orm";
import { releaseAccessCodesForRideRows } from "../db/accessCodesData";
import { getDb, isPostgresConfigured } from "../db/client";
import { ridesTable } from "../db/schema";
import { broadcastRideStatusChange } from "../wsRideSocketHub";

export const DEFAULT_RESERVATION_ACTIVATION_WINDOW_MINUTES = 30;

export type ExpiredScheduledRow = {
  id: string;
  passenger_id: string | null;
  access_code_id: string | null;
};

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
    .returning({
      id: ridesTable.id,
      passenger_id: ridesTable.passenger_id,
      access_code_id: ridesTable.access_code_id,
    });

  await releaseAccessCodesForRideRows(rows);

  for (const row of rows) {
    broadcastRideStatusChange(row.id, "expired", "scheduled");
  }

  return rows;
}

export type ExpiredAssignedRow = {
  id: string;
  passenger_id: string | null;
  access_code_id: string | null;
};

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
    .returning({
      id: ridesTable.id,
      passenger_id: ridesTable.passenger_id,
      access_code_id: ridesTable.access_code_id,
    });

  await releaseAccessCodesForRideRows(rows);

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

export type PromotedReservationRow = {
  id: string;
  passenger_id: string | null;
  driver_id: string | null;
  previous_status: "scheduled" | "scheduled_assigned";
};

/**
 * Aktiver Cron: Reservierung im 30-Min-Fenster vor Abholung → `ready_for_dispatch`.
 * Ersetzt die frühere passive Promotion in `listRides` / `findRide`.
 */
export async function promoteReservationsToReadyForDispatch(
  now: Date = new Date(),
): Promise<PromotedReservationRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];

  const threshold = new Date(
    now.getTime() + DEFAULT_RESERVATION_ACTIVATION_WINDOW_MINUTES * 60 * 1000,
  );

  const candidates = await db
    .select({
      id: ridesTable.id,
      status: ridesTable.status,
      passenger_id: ridesTable.passenger_id,
      driver_id: ridesTable.driver_id,
    })
    .from(ridesTable)
    .where(
      and(
        inArray(ridesTable.status, ["scheduled", "scheduled_assigned"]),
        isNotNull(ridesTable.scheduled_at),
        lte(ridesTable.scheduled_at, threshold),
        gt(ridesTable.scheduled_at, now),
      ),
    );

  const ids = candidates.map((r) => r.id).filter((id) => id.length > 0);
  if (ids.length === 0) return [];

  await db
    .update(ridesTable)
    .set({ status: "ready_for_dispatch" })
    .where(inArray(ridesTable.id, ids));

  const promoted: PromotedReservationRow[] = [];
  for (const row of candidates) {
    const prev = row.status;
    if (prev !== "scheduled" && prev !== "scheduled_assigned") continue;
    promoted.push({
      id: row.id,
      passenger_id: row.passenger_id,
      driver_id: row.driver_id,
      previous_status: prev,
    });
    broadcastRideStatusChange(row.id, "ready_for_dispatch", prev);
  }

  return promoted;
}
