import { and, eq, gt, inArray, isNotNull, isNull, lte, lt, or } from "drizzle-orm";
import { releaseAccessCodesForRideRows } from "../db/accessCodesData";
import { getDb, isPostgresConfigured } from "../db/client";
import { findRide } from "../db/ridesData";
import { ridesTable } from "../db/schema";
import { notifyCronRideStatusChange } from "../lib/cronRideStatusNotify";
import {
  notifyMarketOnlineDriversInstantRideOffer,
} from "../lib/driverRideExpoPush";

export const DEFAULT_RESERVATION_ACTIVATION_WINDOW_MINUTES = 30;

/** Ab wann Fahrer manuell aktivieren darf (Minuten vor Abholung). */
export const DEFAULT_RESERVATION_MANUAL_ACTIVATION_OPENS_MINUTES = 45;

/** Spätestens bis zu so vielen Minuten vor Abholung muss aktiviert sein — sonst Freigabe + Sperre. */
export const DEFAULT_RESERVATION_MANUAL_ACTIVATION_DEADLINE_MINUTES_REMAINING = 25;

/** @deprecated Alias — Fenster endet bei {@link DEFAULT_RESERVATION_MANUAL_ACTIVATION_DEADLINE_MINUTES_REMAINING}. */
export const DEFAULT_RESERVATION_MANUAL_ACTIVATION_WINDOW_MINUTES =
  DEFAULT_RESERVATION_MANUAL_ACTIVATION_OPENS_MINUTES;

export function isWithinManualReservationActivationWindow(minsUntilPickup: number): boolean {
  return (
    minsUntilPickup >= DEFAULT_RESERVATION_MANUAL_ACTIVATION_DEADLINE_MINUTES_REMAINING &&
    minsUntilPickup <= DEFAULT_RESERVATION_MANUAL_ACTIVATION_OPENS_MINUTES
  );
}

/** Abholzeit + Puffer ohne Fahrtbeginn → `expired` (aktivierte Reservierung ohne Annahme/Fahrtstart). */
export const DEFAULT_RESERVATION_NO_START_EXPIRE_BUFFER_MINUTES = 45;

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
    notifyCronRideStatusChange({
      rideId: row.id,
      fromStatus: "scheduled",
      toStatus: "expired",
      passengerId: row.passenger_id,
    });
  }

  return rows;
}

export type ExpiredAssignedRow = {
  id: string;
  passenger_id: string | null;
  access_code_id: string | null;
  driver_id: string | null;
  company_id: string | null;
};

/** Aktiver Cron: `scheduled_assigned` mit Abholzeit + Puffer in der Vergangenheit → `expired`. */
export async function expirePastAssignedReservations(
  now: Date = new Date(),
  bufferMinutes: number = DEFAULT_RESERVATION_NO_START_EXPIRE_BUFFER_MINUTES,
): Promise<ExpiredAssignedRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];

  const bufferMs = Math.max(0, bufferMinutes) * 60 * 1000;
  const expireBefore = new Date(now.getTime() - bufferMs);

  const rows = await db
    .update(ridesTable)
    .set({ status: "expired" })
    .where(
      and(
        eq(ridesTable.status, "scheduled_assigned"),
        isNotNull(ridesTable.scheduled_at),
        lt(ridesTable.scheduled_at, expireBefore),
      ),
    )
    .returning({
      id: ridesTable.id,
      passenger_id: ridesTable.passenger_id,
      access_code_id: ridesTable.access_code_id,
      driver_id: ridesTable.driver_id,
      company_id: ridesTable.company_id,
    });

  await releaseAccessCodesForRideRows(rows);

  for (const row of rows) {
    notifyCronRideStatusChange({
      rideId: row.id,
      fromStatus: "scheduled_assigned",
      toStatus: "expired",
      passengerId: row.passenger_id,
    });
  }

  return rows;
}

export type ExpiredReadyDispatchRow = {
  id: string;
  passenger_id: string | null;
  access_code_id: string | null;
  driver_id: string | null;
  company_id: string | null;
};

/**
 * Aktiver Cron: aktivierte Reservierung (`searching_driver` / Legacy `ready_for_dispatch`) nach
 * Abholzeit + Puffer ohne Fahrtstart → `expired`.
 */
export async function expireReadyForDispatchWithoutTripStart(
  now: Date = new Date(),
  bufferMinutes: number = DEFAULT_RESERVATION_NO_START_EXPIRE_BUFFER_MINUTES,
): Promise<ExpiredReadyDispatchRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];

  const bufferMs = Math.max(0, bufferMinutes) * 60 * 1000;
  const expireBefore = new Date(now.getTime() - bufferMs);

  const candidates = await db
    .select({
      id: ridesTable.id,
      status: ridesTable.status,
      passenger_id: ridesTable.passenger_id,
      access_code_id: ridesTable.access_code_id,
      driver_id: ridesTable.driver_id,
      company_id: ridesTable.company_id,
    })
    .from(ridesTable)
    .where(
      and(
        or(
          eq(ridesTable.status, "searching_driver"),
          eq(ridesTable.status, "ready_for_dispatch"),
        ),
        isNotNull(ridesTable.scheduled_at),
        lt(ridesTable.scheduled_at, expireBefore),
      ),
    );

  const ids = candidates.map((r) => r.id).filter((id) => id.length > 0);
  if (ids.length === 0) return [];

  const rows = await db
    .update(ridesTable)
    .set({ status: "expired" })
    .where(inArray(ridesTable.id, ids))
    .returning({
      id: ridesTable.id,
      passenger_id: ridesTable.passenger_id,
      access_code_id: ridesTable.access_code_id,
      driver_id: ridesTable.driver_id,
      company_id: ridesTable.company_id,
    });

  await releaseAccessCodesForRideRows(rows);

  const fromStatusById = new Map(candidates.map((r) => [r.id, r.status]));
  for (const row of rows) {
    notifyCronRideStatusChange({
      rideId: row.id,
      fromStatus: fromStatusById.get(row.id) ?? "searching_driver",
      toStatus: "expired",
      passengerId: row.passenger_id,
    });
  }

  return rows;
}

export type ReactivatedScheduledRow = {
  id: string;
  passenger_id: string | null;
  driver_id: string | null;
  company_id: string | null;
};

/** @deprecated Nutze {@link releaseMissedManualActivationReservations}. */
export async function releaseMissedActivationReservations(
  activationDeadline: Date,
): Promise<ReactivatedScheduledRow[]> {
  return releaseMissedManualActivationReservations(activationDeadline);
}

export type ReleasedMissedActivationRow = {
  id: string;
  passenger_id: string | null;
  driver_id: string | null;
  company_id: string | null;
};

/**
 * Fahrer hat nicht rechtzeitig aktiviert (Fenster 45–25 Min. vor Abholung verstrichen):
 * `scheduled_assigned` mit ≤25 Min. bis Abholung → Markt (`searching_driver`), Fahrer-Zuweisung weg.
 */
export async function releaseMissedManualActivationReservations(
  now: Date = new Date(),
): Promise<ReleasedMissedActivationRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];

  const releaseThreshold = new Date(
    now.getTime() + DEFAULT_RESERVATION_MANUAL_ACTIVATION_DEADLINE_MINUTES_REMAINING * 60 * 1000,
  );

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
        lte(ridesTable.scheduled_at, releaseThreshold),
      ),
    );

  const missedIds = missed.map((r) => r.id).filter((id) => id.length > 0);
  if (missedIds.length === 0) return [];

  await db
    .update(ridesTable)
    .set({
      status: "searching_driver",
      driver_id: null,
      dispatch_tier: "A",
      dispatch_phase: "trio_a",
      dispatch_tier_started_at: now,
      push_driver_activation_reminder_at: null,
      push_customer_reservation_assigned_at: null,
    })
    .where(inArray(ridesTable.id, missedIds));

  for (const row of missed) {
    notifyCronRideStatusChange({
      rideId: row.id,
      fromStatus: "scheduled_assigned",
      toStatus: "searching_driver",
      passengerId: row.passenger_id,
    });
    const released = await findRide(row.id);
    if (released) void notifyMarketOnlineDriversInstantRideOffer(released);
  }

  return missed;
}

export type PromotedReservationRow = {
  id: string;
  passenger_id: string | null;
  driver_id: string | null;
  previous_status: "scheduled" | "scheduled_assigned";
  to_status: "searching_driver" | "ready_for_dispatch";
};

function reservationActivationThreshold(now: Date): Date {
  return new Date(now.getTime() + DEFAULT_RESERVATION_ACTIVATION_WINDOW_MINUTES * 60 * 1000);
}

/**
 * Offene Reservierung (ohne Fahrer) → `searching_driver` im Mandanten-Markt.
 * `company_id` bleibt erhalten (kein Mandantenverlust im Partner-Panel).
 */
export async function activateUnassignedReservationsToSearchingDriver(
  rideIds: string[],
  now: Date = new Date(),
): Promise<PromotedReservationRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];

  const ids = [...new Set(rideIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

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
        inArray(ridesTable.id, ids),
        eq(ridesTable.status, "scheduled"),
        isNull(ridesTable.driver_id),
        isNotNull(ridesTable.scheduled_at),
        gt(ridesTable.scheduled_at, now),
      ),
    );

  const eligibleIds = candidates.map((r) => r.id).filter((id) => id.length > 0);
  if (eligibleIds.length === 0) return [];

  await db
    .update(ridesTable)
    .set({
      status: "searching_driver",
      dispatch_tier: "A",
      dispatch_phase: "trio_a",
      dispatch_tier_started_at: now,
      push_driver_activation_reminder_at: null,
    })
    .where(inArray(ridesTable.id, eligibleIds));

  const promoted: PromotedReservationRow[] = [];
  for (const row of candidates) {
    if (row.status !== "scheduled") continue;
    promoted.push({
      id: row.id,
      passenger_id: row.passenger_id,
      driver_id: row.driver_id,
      previous_status: "scheduled",
      to_status: "searching_driver",
    });
    notifyCronRideStatusChange({
      rideId: row.id,
      fromStatus: "scheduled",
      toStatus: "searching_driver",
      passengerId: row.passenger_id,
    });
    const activated = await findRide(row.id);
    if (activated) void notifyMarketOnlineDriversInstantRideOffer(activated);
  }

  return promoted;
}

/**
 * Zugewiesene Reservierung → `ready_for_dispatch` (Fahrer bleibt zugewiesen).
 * Nur über manuelles Fahrer-„Aktivieren“ (PATCH /rides/:id) — nicht per Cron.
 */
export async function activateAssignedReservationsToReadyForDispatch(
  rideIds: string[],
  now: Date = new Date(),
): Promise<PromotedReservationRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];

  const ids = [...new Set(rideIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

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
        inArray(ridesTable.id, ids),
        eq(ridesTable.status, "scheduled_assigned"),
        isNotNull(ridesTable.driver_id),
        isNotNull(ridesTable.scheduled_at),
        gt(ridesTable.scheduled_at, now),
      ),
    );

  const eligibleIds = candidates.map((r) => r.id).filter((id) => id.length > 0);
  if (eligibleIds.length === 0) return [];

  await db
    .update(ridesTable)
    .set({
      status: "ready_for_dispatch",
      dispatch_tier: "A",
      dispatch_phase: "trio_a",
      dispatch_tier_started_at: now,
      push_driver_activation_reminder_at: null,
    })
    .where(inArray(ridesTable.id, eligibleIds));

  const promoted: PromotedReservationRow[] = [];
  for (const row of candidates) {
    if (row.status !== "scheduled_assigned") continue;
    promoted.push({
      id: row.id,
      passenger_id: row.passenger_id,
      driver_id: row.driver_id,
      previous_status: "scheduled_assigned",
      to_status: "ready_for_dispatch",
    });
    notifyCronRideStatusChange({
      rideId: row.id,
      fromStatus: "scheduled_assigned",
      toStatus: "ready_for_dispatch",
      passengerId: row.passenger_id,
    });
    // Kein weiterer Fahrer-Push: Aktivierung war manuell durch denselben Fahrer.
    // Kunden-Push läuft über notifyCronRideStatusChange → notifyPassengerReservationActivated.
  }

  return promoted;
}

/**
 * Manuelle Aktivierung (Fahrer-Button / PATCH) — wählt Pfad nach Status.
 */
export async function activateReservationsForPremiumDispatch(
  rideIds: string[],
  now: Date = new Date(),
): Promise<PromotedReservationRow[]> {
  const searching = await activateUnassignedReservationsToSearchingDriver(rideIds, now);
  const ready = await activateAssignedReservationsToReadyForDispatch(rideIds, now);
  return [...searching, ...ready];
}

/**
 * Aktiver Cron Job 4: Reservierung im 30-Min-Fenster vor Abholung dispatch-bereit machen.
 * - `scheduled` (offen) → `searching_driver` + Markt-Push
 * Zugewiesene Reservierungen (`scheduled_assigned`) nur per manuellem Fahrer-„Aktivieren“ (PATCH).
 */
export async function promoteReservationsToReadyForDispatch(
  now: Date = new Date(),
): Promise<PromotedReservationRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];

  const threshold = reservationActivationThreshold(now);

  const unassigned = await db
    .select({ id: ridesTable.id })
    .from(ridesTable)
    .where(
      and(
        eq(ridesTable.status, "scheduled"),
        isNull(ridesTable.driver_id),
        isNotNull(ridesTable.scheduled_at),
        lte(ridesTable.scheduled_at, threshold),
        gt(ridesTable.scheduled_at, now),
      ),
    );

  const unassignedIds = unassigned.map((r) => r.id).filter(Boolean);

  return activateUnassignedReservationsToSearchingDriver(unassignedIds, now);
}

/** Sofort prüfen, ob eine frisch angelegte Reservierung schon im 30-Min-Fenster liegt. */
export async function promoteReservationIfInActivationWindow(
  rideId: string,
  now: Date = new Date(),
): Promise<PromotedReservationRow[]> {
  const id = rideId.trim();
  if (!id) return [];

  const ride = await findRide(id);
  if (!ride?.scheduledAt) return [];

  const pickup = new Date(ride.scheduledAt);
  const threshold = reservationActivationThreshold(now);
  if (pickup.getTime() <= now.getTime() || pickup.getTime() > threshold.getTime()) {
    return [];
  }

  if (ride.status === "scheduled" && !ride.driverId) {
    return activateUnassignedReservationsToSearchingDriver([id], now);
  }
  return [];
}
