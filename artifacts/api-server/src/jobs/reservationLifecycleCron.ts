/**
 * Reservierungs-Lifecycle-Cron (alle 2 Minuten aus index.ts).
 * Job 1–4, 6–10 — siehe Kommentare in runReservationLifecycleCron.
 */
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { releaseAccessCodesForRideRows } from "../db/accessCodesData";
import { getDb, isPostgresConfigured } from "../db/client";
import { setReservationSuspension } from "../db/fleetDriversData";
import { claimRidesForDriverActivationReminderPush } from "../db/ridePushNotificationMarkers";
import { ridesTable } from "../db/schema";
import { notifyCronRideStatusChange } from "../lib/cronRideStatusNotify";
import {
  notifyDriverMissedActivationReservation,
  notifyDriverReservationActivationReminder,
} from "../lib/driverRideExpoPush";
import { logger } from "../lib/logger";
import { flagDriverLateReservations } from "./driverLateDetection";
import { runFailedPaymentRecoveryCron } from "./failedPaymentRecovery";
import { expireStaleOpenRides, recoverGhostAcceptedRides } from "./ghostRideRecovery";
import { purgeStaleRideLocationHistory } from "./rideLocationHistoryRetention";
import {
  expirePastAssignedReservations,
  expirePastScheduledReservations,
  expireReadyForDispatchWithoutTripStart,
  promoteReservationsToReadyForDispatch,
} from "./reservationLifecycle";

export type ReservationLifecycleCronResult = {
  noDriverCancelled: number;
  reminderPushes: number;
  expiredAssigned: number;
  expiredScheduled: number;
  expiredReadyDispatch: number;
  promoted: number;
  ghostRecovered: number;
  staleExpired: number;
  lateFlagged: number;
};

let lastRideLocationHistoryPurgeMs = 0;
/** Heartbeat alle 15 Ticks (≈30 Min bei 2-Min-Intervall) — Produktion: pm2 logs | rg reservationLifecycle. */
let lifecycleCronTick = 0;

export async function runReservationLifecycleCron(
  now: Date = new Date(),
): Promise<ReservationLifecycleCronResult | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;

  const nowMs = now.getTime();
  const result: ReservationLifecycleCronResult = {
    noDriverCancelled: 0,
    reminderPushes: 0,
    expiredAssigned: 0,
    expiredScheduled: 0,
    expiredReadyDispatch: 0,
    promoted: 0,
    ghostRecovered: 0,
    staleExpired: 0,
    lateFlagged: 0,
  };

  // Job 4 zuerst: T−30-Fenster freischalten, bevor Job 1 offene `scheduled` storniert.
  const promoted = await promoteReservationsToReadyForDispatch(now);
  result.promoted = promoted.length;
  if (promoted.length > 0) {
    logger.info(
      {
        count: promoted.length,
        rideIds: promoted.map((r) => r.id),
        transitions: promoted.map((r) => ({
          id: r.id,
          from: r.previous_status,
          to: r.to_status,
        })),
      },
      "[Cron Job 4] Reservierung dispatch-bereit (30-Min-Fenster)",
    );
  }

  const cancelThreshold = new Date(nowMs + 10 * 60 * 1000);
  const noDriverCancelled = await db
    .update(ridesTable)
    .set({ status: "cancelled_by_system" })
    .where(
      and(
        eq(ridesTable.status, "scheduled"),
        isNotNull(ridesTable.scheduled_at),
        lte(ridesTable.scheduled_at, cancelThreshold),
      ),
    )
    .returning({
      id: ridesTable.id,
      passenger_id: ridesTable.passenger_id,
      access_code_id: ridesTable.access_code_id,
    });
  result.noDriverCancelled = noDriverCancelled.length;
  if (noDriverCancelled.length > 0) {
    logger.info(
      {
        count: noDriverCancelled.length,
        rideIds: noDriverCancelled.map((r) => r.id),
        fromStatus: "scheduled",
        toStatus: "cancelled_by_system",
      },
      "[Cron Job 1] scheduled → cancelled_by_system",
    );
    await releaseAccessCodesForRideRows(noDriverCancelled);
    for (const row of noDriverCancelled) {
      notifyCronRideStatusChange({
        rideId: row.id,
        fromStatus: "scheduled",
        toStatus: "cancelled_by_system",
        passengerId: row.passenger_id,
      });
    }
  }

  const reminderRows = await claimRidesForDriverActivationReminderPush(now);
  for (const row of reminderRows) {
    const did = typeof row.driver_id === "string" ? row.driver_id.trim() : "";
    const cid = typeof row.company_id === "string" ? row.company_id.trim() : "";
    if (did && cid) void notifyDriverReservationActivationReminder(did, cid, row.id);
  }
  result.reminderPushes = reminderRows.length;

  const applyMissedActivationSanctions = async (
    rows: Array<{ id: string; driver_id: string | null; company_id: string | null }>,
  ) => {
    for (const row of rows) {
      const did = typeof row.driver_id === "string" ? row.driver_id.trim() : "";
      const cid = typeof row.company_id === "string" ? row.company_id.trim() : "";
      if (!did || !cid) continue;
      await setReservationSuspension(did, cid, new Date(nowMs + 24 * 60 * 60 * 1000));
      logger.warn({ driverId: did, rideId: row.id }, "[Cron] Aktivierung verpasst → 24h Sperre (expired)");
      void notifyDriverMissedActivationReservation(did, cid, row.id);
    }
  };

  const expiredAssigned = await expirePastAssignedReservations(now);
  result.expiredAssigned = expiredAssigned.length;
  if (expiredAssigned.length > 0) {
    logger.info(
      {
        count: expiredAssigned.length,
        rideIds: expiredAssigned.map((r) => r.id),
        fromStatus: "scheduled_assigned",
        toStatus: "expired",
      },
      "[Cron Job 3a] scheduled_assigned → expired (Abholzeit + Puffer ohne Start)",
    );
    await applyMissedActivationSanctions(expiredAssigned);
  }

  const expiredScheduled = await expirePastScheduledReservations(now);
  result.expiredScheduled = expiredScheduled.length;
  if (expiredScheduled.length > 0) {
    logger.info(
      {
        count: expiredScheduled.length,
        rideIds: expiredScheduled.map((r) => r.id),
        fromStatus: "scheduled",
        toStatus: "expired",
      },
      "[Cron Job 3b] scheduled → expired",
    );
  }

  const expiredReadyDispatch = await expireReadyForDispatchWithoutTripStart(now);
  result.expiredReadyDispatch = expiredReadyDispatch.length;
  if (expiredReadyDispatch.length > 0) {
    logger.info(
      {
        count: expiredReadyDispatch.length,
        rideIds: expiredReadyDispatch.map((r) => r.id),
        fromStatuses: ["searching_driver", "ready_for_dispatch"],
        toStatus: "expired",
      },
      "[Cron Job 3c] Aktivierte Reservierung → expired (Abholzeit + Puffer ohne Annahme/Fahrtstart)",
    );
    await applyMissedActivationSanctions(expiredReadyDispatch);
  }

  const ghostRecovered = await recoverGhostAcceptedRides(nowMs);
  result.ghostRecovered = ghostRecovered.length;
  if (ghostRecovered.length > 0) {
    logger.info({ count: ghostRecovered.length, rideIds: ghostRecovered }, "[Cron] Ghost-Rides recovered");
  }

  const staleExpired = await expireStaleOpenRides(nowMs);
  result.staleExpired = staleExpired.length;
  if (staleExpired.length > 0) {
    logger.info(
      {
        count: staleExpired.length,
        rideIds: staleExpired,
        fromStatuses: ["searching_driver", "ready_for_dispatch", "in_progress"],
        toStatus: "expired",
      },
      "[Cron Job 7] Stale open rides → expired (created_at-Schwelle)",
    );
  }

  const lateFlagged = await flagDriverLateReservations(now);
  result.lateFlagged = lateFlagged.length;
  if (lateFlagged.length > 0) {
    logger.warn({ count: lateFlagged.length, rideIds: lateFlagged }, "[Cron] driver_late flagged");
  }

  await runFailedPaymentRecoveryCron(now);

  if (nowMs - lastRideLocationHistoryPurgeMs >= 24 * 60 * 60 * 1000) {
    lastRideLocationHistoryPurgeMs = nowMs;
    await purgeStaleRideLocationHistory(now);
  }

  lifecycleCronTick += 1;
  const hasActivity =
    result.promoted > 0 ||
    result.noDriverCancelled > 0 ||
    result.expiredAssigned > 0 ||
    result.expiredScheduled > 0 ||
    result.expiredReadyDispatch > 0 ||
    result.reminderPushes > 0 ||
    result.ghostRecovered > 0 ||
    result.staleExpired > 0 ||
    result.lateFlagged > 0;
  if (hasActivity || lifecycleCronTick % 15 === 0) {
    logger.info({ tick: lifecycleCronTick, ...result }, "[Cron] reservationLifecycle tick");
  }

  return result;
}

export const RESERVATION_LIFECYCLE_CRON_MS = 2 * 60 * 1000;
