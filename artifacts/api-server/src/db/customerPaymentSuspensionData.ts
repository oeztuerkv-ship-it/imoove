import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "./client";
import { customerPaymentSuspensionTable } from "./schema";

export type CustomerPaymentSuspensionRow = {
  passengerId: string;
  outstandingRideId: string | null;
  suspendedAt: Date;
  reason: string;
  liftedAt: Date | null;
  liftedByAdmin: string | null;
};

const REASON_UNPAID_RIDE = "unpaid_ride";

function mapRow(r: typeof customerPaymentSuspensionTable.$inferSelect): CustomerPaymentSuspensionRow {
  return {
    passengerId: r.passenger_id,
    outstandingRideId: r.outstanding_ride_id,
    suspendedAt: r.suspended_at,
    reason: r.reason,
    liftedAt: r.lifted_at,
    liftedByAdmin: r.lifted_by_admin,
  };
}

export async function findActiveCustomerPaymentSuspension(
  passengerId: string,
): Promise<CustomerPaymentSuspensionRow | null> {
  const db = getDb();
  if (!db) return null;
  const pax = passengerId.trim();
  if (!pax) return null;
  const rows = await db
    .select()
    .from(customerPaymentSuspensionTable)
    .where(
      and(
        eq(customerPaymentSuspensionTable.passenger_id, pax),
        isNull(customerPaymentSuspensionTable.lifted_at),
      ),
    )
    .limit(1);
  const r = rows[0];
  return r ? mapRow(r) : null;
}

export async function upsertCustomerPaymentSuspension(input: {
  passengerId: string;
  outstandingRideId: string;
  reason?: string;
}): Promise<CustomerPaymentSuspensionRow> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const pax = input.passengerId.trim();
  const rideId = input.outstandingRideId.trim();
  if (!pax || !rideId) throw new Error("passenger_and_ride_required");
  const now = new Date();
  const reason = (input.reason ?? REASON_UNPAID_RIDE).trim() || REASON_UNPAID_RIDE;

  await db
    .insert(customerPaymentSuspensionTable)
    .values({
      passenger_id: pax,
      outstanding_ride_id: rideId,
      suspended_at: now,
      reason,
      lifted_at: null,
      lifted_by_admin: null,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: customerPaymentSuspensionTable.passenger_id,
      set: {
        outstanding_ride_id: rideId,
        suspended_at: now,
        reason,
        lifted_at: null,
        lifted_by_admin: null,
        updated_at: now,
      },
    });

  const row = await findActiveCustomerPaymentSuspension(pax);
  if (!row) throw new Error("payment_suspension_upsert_failed");
  return row;
}

export async function liftCustomerPaymentSuspension(
  passengerId: string,
  liftedByAdmin?: string | null,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const pax = passengerId.trim();
  if (!pax) return false;
  const now = new Date();
  const rows = await db
    .update(customerPaymentSuspensionTable)
    .set({
      lifted_at: now,
      lifted_by_admin: liftedByAdmin?.trim() || null,
      updated_at: now,
    })
    .where(
      and(
        eq(customerPaymentSuspensionTable.passenger_id, pax),
        isNull(customerPaymentSuspensionTable.lifted_at),
      ),
    )
    .returning({ passenger_id: customerPaymentSuspensionTable.passenger_id });
  return rows.length > 0;
}

export { REASON_UNPAID_RIDE };
