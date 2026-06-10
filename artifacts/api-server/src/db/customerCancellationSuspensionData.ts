import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  customerCancellationSuspensionTable,
  rideEventsTable,
  ridesTable,
} from "./schema";

export type CustomerCancellationSuspensionRow = {
  passengerId: string;
  suspendedUntil: Date;
  suspendedAt: Date;
  reason: string;
  liftedAt: Date | null;
  liftedByAdmin: string | null;
};

const SUSPENSION_REASON_AUTO = "too_many_cancellations";
const SUSPENSION_REASON_ADMIN = "admin_manual";

function mapRow(r: typeof customerCancellationSuspensionTable.$inferSelect): CustomerCancellationSuspensionRow {
  return {
    passengerId: r.passenger_id,
    suspendedUntil: r.suspended_until,
    suspendedAt: r.suspended_at,
    reason: r.reason,
    liftedAt: r.lifted_at,
    liftedByAdmin: r.lifted_by_admin,
  };
}

export async function countPassengerCancellationsInLast24Hours(passengerId: string): Promise<number> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const pax = passengerId.trim();
  if (!pax) return 0;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const eventRows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(rideEventsTable)
    .where(
      and(
        eq(rideEventsTable.event_type, "cancel_reason"),
        eq(rideEventsTable.actor_type, "passenger"),
        eq(rideEventsTable.actor_id, pax),
        gte(rideEventsTable.created_at, since),
      ),
    );
  const fromEvents = Number(eventRows[0]?.c ?? 0);
  if (fromEvents > 0) return fromEvents;

  const rideRows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(ridesTable)
    .where(
      and(
        eq(ridesTable.passenger_id, pax),
        eq(ridesTable.status, "cancelled_by_customer"),
        gte(ridesTable.updated_at, since),
      ),
    );
  return Number(rideRows[0]?.c ?? 0);
}

export async function findActiveCustomerCancellationSuspension(
  passengerId: string,
): Promise<CustomerCancellationSuspensionRow | null> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const pax = passengerId.trim();
  if (!pax) return null;
  const now = new Date();
  const rows = await db
    .select()
    .from(customerCancellationSuspensionTable)
    .where(
      and(
        eq(customerCancellationSuspensionTable.passenger_id, pax),
        isNull(customerCancellationSuspensionTable.lifted_at),
        gte(customerCancellationSuspensionTable.suspended_until, now),
      ),
    )
    .limit(1);
  const r = rows[0];
  return r ? mapRow(r) : null;
}

export async function upsertCustomerCancellationSuspension(input: {
  passengerId: string;
  suspendedUntil: Date;
  reason?: string;
  liftedByAdmin?: string | null;
}): Promise<CustomerCancellationSuspensionRow> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const pax = input.passengerId.trim();
  if (!pax) throw new Error("passenger_id_required");
  const now = new Date();
  const reason = (input.reason ?? SUSPENSION_REASON_AUTO).trim() || SUSPENSION_REASON_AUTO;

  await db
    .insert(customerCancellationSuspensionTable)
    .values({
      passenger_id: pax,
      suspended_until: input.suspendedUntil,
      suspended_at: now,
      reason,
      lifted_at: null,
      lifted_by_admin: input.liftedByAdmin ?? null,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: customerCancellationSuspensionTable.passenger_id,
      set: {
        suspended_until: input.suspendedUntil,
        suspended_at: now,
        reason,
        lifted_at: null,
        lifted_by_admin: input.liftedByAdmin ?? null,
        updated_at: now,
      },
    });

  const row = await findActiveCustomerCancellationSuspension(pax);
  if (!row) throw new Error("suspension_upsert_failed");
  return row;
}

export async function liftCustomerCancellationSuspension(
  passengerId: string,
  liftedByAdmin: string,
): Promise<boolean> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const pax = passengerId.trim();
  const admin = liftedByAdmin.trim();
  if (!pax) return false;
  const now = new Date();
  const rows = await db
    .update(customerCancellationSuspensionTable)
    .set({
      lifted_at: now,
      lifted_by_admin: admin || null,
      updated_at: now,
    })
    .where(
      and(
        eq(customerCancellationSuspensionTable.passenger_id, pax),
        isNull(customerCancellationSuspensionTable.lifted_at),
      ),
    )
    .returning({ passenger_id: customerCancellationSuspensionTable.passenger_id });
  return rows.length > 0;
}

export async function adminSuspendCustomerCancellation(input: {
  passengerId: string;
  hours?: number;
  adminUsername: string;
}): Promise<CustomerCancellationSuspensionRow> {
  const hours = Number.isFinite(input.hours) && (input.hours ?? 0) > 0 ? Math.min(input.hours!, 24 * 30) : 24;
  const until = new Date(Date.now() + hours * 60 * 60 * 1000);
  return upsertCustomerCancellationSuspension({
    passengerId: input.passengerId,
    suspendedUntil: until,
    reason: SUSPENSION_REASON_ADMIN,
    liftedByAdmin: input.adminUsername,
  });
}

export { SUSPENSION_REASON_ADMIN, SUSPENSION_REASON_AUTO };
