import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "../db/client";
import { rideEventsTable } from "../db/schema";

type StatusEvent = { toStatus: string; at: Date };

function firstAt(events: StatusEvent[], status: string): Date | null {
  for (const e of events) {
    if (e.toStatus === status) return e.at;
  }
  return null;
}

function minDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

/** Echte Fahrtdauer in Minuten aus Status-Historie (Fahrtbeginn → completed). */
export function computeActualRideDurationMinutes(events: StatusEvent[]): number | null {
  const completed = firstAt(events, "completed");
  if (!completed) return null;

  const rideStart = minDate(
    firstAt(events, "passenger_onboard"),
    minDate(
      firstAt(events, "in_progress"),
      minDate(
        minDate(
          minDate(firstAt(events, "driver_arriving"), firstAt(events, "driver_waiting")),
          firstAt(events, "arrived"),
        ),
        firstAt(events, "accepted"),
      ),
    ),
  );
  if (!rideStart) return null;

  const ms = completed.getTime() - rideStart.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.max(1, Math.round(ms / 60_000));
}

export async function listActualDurationMinutesByRideIds(
  rideIds: string[],
): Promise<Map<string, number>> {
  const ids = Array.from(new Set(rideIds.map((id) => id.trim()).filter((id) => id.length > 0)));
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  if (!isPostgresConfigured()) return out;

  const db = getDb();
  if (!db) return out;

  const rows = await db
    .select({
      rideId: rideEventsTable.ride_id,
      toStatus: rideEventsTable.to_status,
      createdAt: rideEventsTable.created_at,
    })
    .from(rideEventsTable)
    .where(
      and(
        inArray(rideEventsTable.ride_id, ids),
        eq(rideEventsTable.event_type, "ride_status_changed"),
      ),
    )
    .orderBy(asc(rideEventsTable.created_at));

  const byRide = new Map<string, StatusEvent[]>();
  for (const row of rows) {
    const status = typeof row.toStatus === "string" ? row.toStatus.trim() : "";
    if (!status) continue;
    const list = byRide.get(row.rideId) ?? [];
    list.push({ toStatus: status, at: row.createdAt as Date });
    byRide.set(row.rideId, list);
  }

  for (const [rideId, events] of byRide) {
    const minutes = computeActualRideDurationMinutes(events);
    if (minutes != null) out.set(rideId, minutes);
  }
  return out;
}
