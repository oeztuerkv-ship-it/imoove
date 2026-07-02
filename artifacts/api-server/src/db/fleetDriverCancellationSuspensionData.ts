import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { fleetDriverCancellationSuspensionTable, rideEventsTable, ridesTable } from "./schema";

export const FLEET_DRIVER_CANCELLATION_THRESHOLD = 5;
export const FLEET_DRIVER_CANCELLATION_WINDOW_DAYS = 7;
export const FLEET_DRIVER_CANCELLATION_SUSPENSION_HOURS = 24;

export const FLEET_DRIVER_CANCELLATION_SUSPENSION_MESSAGE_DE =
  "Ihr Konto ist wegen zu vieler Stornos nach Fahrtannahme vorläufig gesperrt. Kein Dispatch und keine neuen Aufträge.";

export type FleetDriverCancellationSuspensionRow = {
  fleetDriverId: string;
  companyId: string;
  suspendedUntil: Date;
  suspendedAt: Date;
  reason: string;
  liftedAt: Date | null;
  liftedByAdmin: string | null;
};

const SUSPENSION_REASON_AUTO = "too_many_post_accept_cancellations";

function mapRow(
  r: typeof fleetDriverCancellationSuspensionTable.$inferSelect,
): FleetDriverCancellationSuspensionRow {
  return {
    fleetDriverId: r.fleet_driver_id,
    companyId: r.company_id,
    suspendedUntil: r.suspended_until,
    suspendedAt: r.suspended_at,
    reason: r.reason,
    liftedAt: r.lifted_at,
    liftedByAdmin: r.lifted_by_admin,
  };
}

function windowSince(): Date {
  return new Date(Date.now() - FLEET_DRIVER_CANCELLATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/** Stornos nach Annahme (Soft + Hard) im rollierenden Fenster. */
export async function countFleetDriverPostAcceptCancellationsInWindow(
  fleetDriverId: string,
  companyId: string,
): Promise<number> {
  if (!isPostgresConfigured()) return 0;
  const db = getDb();
  if (!db) return 0;
  const did = fleetDriverId.trim();
  const cid = companyId.trim();
  if (!did || !cid) return 0;
  try {
    const since = windowSince();

    const eventRows = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(rideEventsTable)
      .where(
        and(
          eq(rideEventsTable.event_type, "driver_post_accept_cancel"),
          eq(rideEventsTable.actor_id, did),
          gte(rideEventsTable.created_at, since),
          eq(sql`COALESCE(${rideEventsTable.payload}->>'companyId', '')`, cid),
        ),
      );
    const fromEvents = Number(eventRows[0]?.c ?? 0);
    if (fromEvents > 0) return fromEvents;

    const rideRows = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(ridesTable)
      .where(
        and(
          eq(ridesTable.driver_id, did),
          eq(ridesTable.company_id, cid),
          eq(ridesTable.status, "cancelled_by_driver"),
          gte(ridesTable.updated_at, since),
        ),
      );
    return Number(rideRows[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

export async function findActiveFleetDriverCancellationSuspension(
  fleetDriverId: string,
): Promise<FleetDriverCancellationSuspensionRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const did = fleetDriverId.trim();
  if (!did) return null;
  try {
    const now = new Date();
    const rows = await db
      .select()
      .from(fleetDriverCancellationSuspensionTable)
      .where(
        and(
          eq(fleetDriverCancellationSuspensionTable.fleet_driver_id, did),
          isNull(fleetDriverCancellationSuspensionTable.lifted_at),
          gte(fleetDriverCancellationSuspensionTable.suspended_until, now),
        ),
      )
      .limit(1);
    const r = rows[0];
    return r ? mapRow(r) : null;
  } catch {
    return null;
  }
}

export async function upsertFleetDriverCancellationSuspension(input: {
  fleetDriverId: string;
  companyId: string;
  suspendedUntil: Date;
  reason?: string;
}): Promise<FleetDriverCancellationSuspensionRow> {
  if (!isPostgresConfigured()) throw new Error("database_not_configured");
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const did = input.fleetDriverId.trim();
  const cid = input.companyId.trim();
  if (!did || !cid) throw new Error("fleet_driver_id_required");
  const now = new Date();
  const reason = (input.reason ?? SUSPENSION_REASON_AUTO).trim() || SUSPENSION_REASON_AUTO;

  await db
    .insert(fleetDriverCancellationSuspensionTable)
    .values({
      fleet_driver_id: did,
      company_id: cid,
      suspended_until: input.suspendedUntil,
      suspended_at: now,
      reason,
      lifted_at: null,
      lifted_by_admin: null,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: fleetDriverCancellationSuspensionTable.fleet_driver_id,
      set: {
        company_id: cid,
        suspended_until: input.suspendedUntil,
        suspended_at: now,
        reason,
        lifted_at: null,
        lifted_by_admin: null,
        updated_at: now,
      },
    });

  const row = await findActiveFleetDriverCancellationSuspension(did);
  if (!row) throw new Error("suspension_upsert_failed");
  return row;
}
