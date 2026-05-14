import { and, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import { getDb } from "./client";
import { ridesTable } from "./schema";

/** true, wenn diese Fahrt noch keinen „Reservierung bestätigt“-Push hatte und jetzt markiert wurde. */
export async function tryMarkCustomerReservationAssignedPushSent(rideId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const id = rideId.trim();
  if (!id) return false;
  const rows = await db
    .update(ridesTable)
    .set({ push_customer_reservation_assigned_at: new Date() })
    .where(and(eq(ridesTable.id, id), isNull(ridesTable.push_customer_reservation_assigned_at)))
    .returning({ id: ridesTable.id });
  return rows.length > 0;
}

export type RideActivationReminderRow = {
  id: string;
  driver_id: string | null;
  company_id: string | null;
};

/**
 * Atomar: alle Fahrten im Fenster Abholzeit in ca. 43–47 Minuten markieren und zurückgeben.
 * (Cron alle 2 Min. → zuverlässig um „45 Min. vorher“.)
 */
export async function claimRidesForDriverActivationReminderPush(now = new Date()): Promise<RideActivationReminderRow[]> {
  const db = getDb();
  if (!db) return [];
  const lower = new Date(now.getTime() + 43 * 60 * 1000);
  const upper = new Date(now.getTime() + 47 * 60 * 1000);
  const rows = await db
    .update(ridesTable)
    .set({ push_driver_activation_reminder_at: new Date() })
    .where(
      and(
        eq(ridesTable.status, "scheduled_assigned"),
        isNotNull(ridesTable.scheduled_at),
        isNotNull(ridesTable.driver_id),
        isNull(ridesTable.push_driver_activation_reminder_at),
        gte(ridesTable.scheduled_at, lower),
        lte(ridesTable.scheduled_at, upper),
      ),
    )
    .returning({ id: ridesTable.id, driver_id: ridesTable.driver_id, company_id: ridesTable.company_id });
  return rows.map((r) => ({
    id: r.id,
    driver_id: r.driver_id,
    company_id: r.company_id,
  }));
}
