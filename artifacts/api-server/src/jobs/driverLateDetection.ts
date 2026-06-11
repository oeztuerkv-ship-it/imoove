import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "../db/client";
import { ridesTable } from "../db/schema";
import { insertSupplementalRideEvent } from "../db/ridesData";

const LATE_AFTER_MINUTES = 5;
const LATE_STATUSES = ["accepted", "driver_arriving", "scheduled_assigned"] as const;

export async function flagDriverLateReservations(now: Date = new Date()): Promise<string[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];

  const deadline = new Date(now.getTime() - LATE_AFTER_MINUTES * 60_000);
  const rows = await db
    .select({
      id: ridesTable.id,
      driver_id: ridesTable.driver_id,
      scheduled_at: ridesTable.scheduled_at,
      status: ridesTable.status,
      partner_booking_meta: ridesTable.partner_booking_meta,
    })
    .from(ridesTable)
    .where(
      and(
        isNotNull(ridesTable.scheduled_at),
        lt(ridesTable.scheduled_at, deadline),
        inArray(ridesTable.status, [...LATE_STATUSES]),
        sql`coalesce(${ridesTable.partner_booking_meta}->>'driver_late_flagged_at', '') = ''`,
      ),
    )
    .limit(50);

  const flagged: string[] = [];
  for (const row of rows) {
    const meta =
      row.partner_booking_meta && typeof row.partner_booking_meta === "object" && !Array.isArray(row.partner_booking_meta)
        ? ({ ...(row.partner_booking_meta as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const flaggedAt = now.toISOString();
    meta.driver_late_flagged_at = flaggedAt;
    meta.driver_late_minutes = LATE_AFTER_MINUTES;
    await db
      .update(ridesTable)
      .set({ partner_booking_meta: meta })
      .where(eq(ridesTable.id, row.id));
    await insertSupplementalRideEvent(row.id, {
      eventType: "driver_late",
      fromStatus: row.status,
      toStatus: row.status,
      actorType: "system",
      actorId: null,
      payload: {
        driverId: row.driver_id ?? null,
        scheduledAt: row.scheduled_at?.toISOString() ?? null,
        flaggedAt,
        lateAfterMinutes: LATE_AFTER_MINUTES,
      },
    });
    flagged.push(row.id);
  }
  return flagged;
}
