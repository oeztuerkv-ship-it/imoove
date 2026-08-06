import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  customerCancellationSuspensionTable,
  rideEventsTable,
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

/**
 * Nur Stornos, nachdem ein Fahrer die Fahrt schon angenommen hat
 * (unterwegs / am Abholort / Fahrt läuft) — nicht während Suche / „kein Fahrer“.
 */
export const CUSTOMER_CANCEL_SUSPENSION_FROM_STATUSES = [
  "accepted",
  "driver_arriving",
  "driver_waiting",
  "passenger_onboard",
  "in_progress",
] as const;

export function customerCancelCountsTowardSuspension(fromStatus: string | null | undefined): boolean {
  const s = String(fromStatus ?? "").trim();
  return (CUSTOMER_CANCEL_SUSPENSION_FROM_STATUSES as readonly string[]).includes(s);
}

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

/**
 * Sperr-relevante Kunden-Stornos in 24h.
 * Zählt nur `cancel_reason`-Events mit from_status nach Fahrer-Annahme —
 * Suche/`open`/„kein Fahrer“-Abbrüche zählen nicht.
 */
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
        inArray(rideEventsTable.from_status, [...CUSTOMER_CANCEL_SUSPENSION_FROM_STATUSES]),
        inArray(rideEventsTable.to_status, ["cancelled_by_customer", "customer_abort_pending_fare"]),
      ),
    );
  return Number(eventRows[0]?.c ?? 0);
}

/** Aktive Auto-Sperren, bei denen die korrigierte 24h-Zählung unter dem Threshold liegt (vermutlich Fehl-Sperre). */
export async function listLikelyWrongfulCustomerCancellationSuspensions(threshold: number): Promise<
  Array<{
    passengerId: string;
    suspendedAt: Date;
    suspendedUntil: Date;
    reason: string;
    countableCancelsIn24h: number;
  }>
> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const now = new Date();
  const rows = await db
    .select()
    .from(customerCancellationSuspensionTable)
    .where(
      and(
        isNull(customerCancellationSuspensionTable.lifted_at),
        gte(customerCancellationSuspensionTable.suspended_until, now),
        eq(customerCancellationSuspensionTable.reason, SUSPENSION_REASON_AUTO),
      ),
    );

  const out: Array<{
    passengerId: string;
    suspendedAt: Date;
    suspendedUntil: Date;
    reason: string;
    countableCancelsIn24h: number;
  }> = [];
  for (const r of rows) {
    const countable = await countPassengerCancellationsInLast24Hours(r.passenger_id);
    if (countable < threshold) {
      out.push({
        passengerId: r.passenger_id,
        suspendedAt: r.suspended_at,
        suspendedUntil: r.suspended_until,
        reason: r.reason,
        countableCancelsIn24h: countable,
      });
    }
  }
  return out;
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
