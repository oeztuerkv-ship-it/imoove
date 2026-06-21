/**
 * HTTP- und WebSocket-Server. Routing, CORS und API-Pfad-Spiegelung (`/api` + Root) liegen in `./app`.
 */
import "./loadEnv";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import app from "./app";
import { seedAdminDefaultsIfEmpty } from "./db/adminData";
import { logger } from "./lib/logger";
import { registerRideWebSockets } from "./wsRideSocketHub";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);

// WebSocket server for real-time GPS sync (path /ws)
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
registerRideWebSockets(wss);

let lastRideLocationHistoryPurgeMs = 0;

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening");
  void seedAdminDefaultsIfEmpty().catch((err) => {
    logger.error({ err }, "seedAdminDefaultsIfEmpty failed");
  });

  // ── Hintergrund-Jobs: Reservierungs-Lifecycle alle 2 Minuten ──
  // Job 1: scheduled → cancelled_by_system (10 min vor Abholung, kein Fahrer)
  // Job 2: Push-Erinnerung scheduled_assigned (~45 min vor Abholung)
  // Job 3a: scheduled_assigned → expired (Abholzeit + 45 min Puffer)
  // Job 3b: scheduled → expired (Abholzeit vorbei)
  // Job 3c: searching_driver | ready_for_dispatch → expired (Abholzeit + 45 min Puffer)
  // Job 4: scheduled | scheduled_assigned → searching_driver + Dispatch-Tier A (30-Min-Fenster)
  // Job 5: (entfernt) — früher scheduled_assigned → scheduled; ersetzt durch 3a/3c → expired + Fahrer-Sperre
  // Job 6: accepted → searching_driver | scheduled (Ghost, idle GPS)
  // Job 7: searching_driver | ready_for_dispatch | in_progress → expired (created_at > 8h)
  // Job 8: driver_late Meta-Flag (accepted, driver_arriving, scheduled_assigned)
  // Job 9: Payment capture retry
  setInterval(async () => {
    try {
      const { getDb, isPostgresConfigured } = await import("./db/client.js");
      if (!isPostgresConfigured()) return;
      const db = getDb();
      if (!db) return;
      const { ridesTable } = await import("./db/schema.js");
      const { and, eq, isNotNull, lte } = await import("drizzle-orm");
      const { setReservationSuspension } = await import("./db/fleetDriversData.js");
      const now = new Date();
      const nowMs = now.getTime();

      // Job 1: Kein Fahrer 10 min vor Fahrt → cancelled_by_system
      const cancelThreshold = new Date(nowMs + 10 * 60 * 1000);
      const noDriverCancelled = await db
        .update(ridesTable)
        .set({ status: "cancelled_by_system" })
        .where(and(eq(ridesTable.status, "scheduled"), isNotNull(ridesTable.scheduled_at), lte(ridesTable.scheduled_at, cancelThreshold)))
        .returning({
          id: ridesTable.id,
          passenger_id: ridesTable.passenger_id,
          access_code_id: ridesTable.access_code_id,
        });
      if (noDriverCancelled.length > 0) {
        logger.info(
          { count: noDriverCancelled.length, rideIds: noDriverCancelled.map((r) => r.id), fromStatus: "scheduled", toStatus: "cancelled_by_system" },
          "[Cron Job 1] scheduled → cancelled_by_system",
        );
        const { releaseAccessCodesForRideRows } = await import("./db/accessCodesData.js");
        await releaseAccessCodesForRideRows(noDriverCancelled);
        const { notifyCronRideStatusChange } = await import("./lib/cronRideStatusNotify.js");
        for (const row of noDriverCancelled) {
          notifyCronRideStatusChange({
            rideId: row.id,
            fromStatus: "scheduled",
            toStatus: "cancelled_by_system",
            passengerId: row.passenger_id,
          });
        }
      }

      // Job 2: ca. 45 Min. vor Abholung → Fahrer erinnern (Aktivierung)
      const { claimRidesForDriverActivationReminderPush } = await import("./db/ridePushNotificationMarkers.js");
      const { notifyDriverReservationActivationReminder, notifyDriverMissedActivationReservation } =
        await import("./lib/driverRideExpoPush.js");
      const reminderRows = await claimRidesForDriverActivationReminderPush(now);
      for (const row of reminderRows) {
        const did = typeof row.driver_id === "string" ? row.driver_id.trim() : "";
        const cid = typeof row.company_id === "string" ? row.company_id.trim() : "";
        if (did && cid) void notifyDriverReservationActivationReminder(did, cid, row.id);
      }

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

      // Job 3: Vergangene Reservierungen → expired
      const { expirePastAssignedReservations, expirePastScheduledReservations, promoteReservationsToReadyForDispatch, expireReadyForDispatchWithoutTripStart } =
        await import("./jobs/reservationLifecycle.js");
      const expiredAssigned = await expirePastAssignedReservations(now);
      if (expiredAssigned.length > 0) {
        logger.info(
          { count: expiredAssigned.length, rideIds: expiredAssigned.map((r) => r.id), fromStatus: "scheduled_assigned", toStatus: "expired" },
          "[Cron Job 3a] scheduled_assigned → expired (Abholzeit + Puffer ohne Start)",
        );
        await applyMissedActivationSanctions(expiredAssigned);
      }

      const expiredScheduled = await expirePastScheduledReservations(now);
      if (expiredScheduled.length > 0) {
        logger.info(
          { count: expiredScheduled.length, rideIds: expiredScheduled.map((r) => r.id), fromStatus: "scheduled", toStatus: "expired" },
          "[Cron Job 3b] scheduled → expired",
        );
      }

      const expiredReadyDispatch = await expireReadyForDispatchWithoutTripStart(now);
      if (expiredReadyDispatch.length > 0) {
        logger.info(
          { count: expiredReadyDispatch.length, rideIds: expiredReadyDispatch.map((r) => r.id), fromStatuses: ["searching_driver", "ready_for_dispatch"], toStatus: "expired" },
          "[Cron Job 3c] Aktivierte Reservierung → expired (Abholzeit + Puffer ohne Annahme/Fahrtstart)",
        );
        await applyMissedActivationSanctions(expiredReadyDispatch);
      }

      // Job 4: 30-Min-Fenster vor Abholung → searching_driver + Premium-Dispatch Tier A
      const promoted = await promoteReservationsToReadyForDispatch(now);
      if (promoted.length > 0) {
        logger.info(
          { count: promoted.length, rideIds: promoted.map((r) => r.id), fromStatuses: promoted.map((r) => r.previous_status), toStatus: "searching_driver" },
          "[Cron Job 4] Reservierung → searching_driver (Premium-Dispatch Tier A)",
        );
      }

      // Job 6: accepted ohne GPS-Fortschritt → zurück in Pool (Ghost-Ride Recovery)
      const { recoverGhostAcceptedRides, expireStaleOpenRides } = await import("./jobs/ghostRideRecovery.js");
      const ghostRecovered = await recoverGhostAcceptedRides(nowMs);
      if (ghostRecovered.length > 0) {
        logger.info({ count: ghostRecovered.length, rideIds: ghostRecovered }, "[Cron] Ghost-Rides recovered");
      }

      // Job 7: >8h in searching_driver / ready_for_dispatch / in_progress (created_at) → expired
      const staleExpired = await expireStaleOpenRides(nowMs);
      if (staleExpired.length > 0) {
        logger.info(
          { count: staleExpired.length, rideIds: staleExpired, fromStatuses: ["searching_driver", "ready_for_dispatch", "in_progress"], toStatus: "expired" },
          "[Cron Job 7] Stale open rides → expired (created_at-Schwelle)",
        );
      }

      // Job 8: Fahrer 5+ Min nach Abholzeit noch nicht vor Ort
      const { flagDriverLateReservations } = await import("./jobs/driverLateDetection.js");
      const lateFlagged = await flagDriverLateReservations(now);
      if (lateFlagged.length > 0) {
        logger.warn({ count: lateFlagged.length, rideIds: lateFlagged }, "[Cron] driver_late flagged");
      }

      // Job 9: Fehlgeschlagene Kartenabbuchungen — automatische Retries
      const { runFailedPaymentRecoveryCron } = await import("./jobs/failedPaymentRecovery.js");
      await runFailedPaymentRecoveryCron(now);

      // Job 10: GPS-Ping-Historie >90 Tage löschen (täglich)
      if (nowMs - lastRideLocationHistoryPurgeMs >= 24 * 60 * 60 * 1000) {
        lastRideLocationHistoryPurgeMs = nowMs;
        const { purgeStaleRideLocationHistory } = await import("./jobs/rideLocationHistoryRetention.js");
        await purgeStaleRideLocationHistory(now);
      }

    } catch (err) {
      logger.error({ err }, "[Cron] reservationLifecycle failed");
    }
  }, 2 * 60 * 1000);

});
