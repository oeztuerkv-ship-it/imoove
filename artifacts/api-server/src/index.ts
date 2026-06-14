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

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening");
  void seedAdminDefaultsIfEmpty().catch((err) => {
    logger.error({ err }, "seedAdminDefaultsIfEmpty failed");
  });

  // ── Hintergrund-Jobs: Reservierungs-Lifecycle alle 2 Minuten ──
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
        logger.info({ count: noDriverCancelled.length }, "[Cron] Kein Fahrer → cancelled_by_system");
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
      const { notifyDriverReservationActivationReminder } = await import("./lib/driverRideExpoPush.js");
      const reminderRows = await claimRidesForDriverActivationReminderPush(now);
      for (const row of reminderRows) {
        const did = typeof row.driver_id === "string" ? row.driver_id.trim() : "";
        const cid = typeof row.company_id === "string" ? row.company_id.trim() : "";
        if (did && cid) void notifyDriverReservationActivationReminder(did, cid, row.id);
      }

      // Job 3: Vergangene Reservierungen → expired (vor Freigabe bei verpasster Aktivierung)
      const { releaseMissedActivationReservations, expirePastAssignedReservations, expirePastScheduledReservations, promoteReservationsToReadyForDispatch } =
        await import("./jobs/reservationLifecycle.js");
      const expiredAssigned = await expirePastAssignedReservations(now);
      if (expiredAssigned.length > 0) {
        logger.info({ count: expiredAssigned.length }, "[Cron] scheduled_assigned → expired");
      }

      const expiredScheduled = await expirePastScheduledReservations(now);
      if (expiredScheduled.length > 0) {
        logger.info({ count: expiredScheduled.length }, "[Cron] scheduled → expired");
      }

      // Job 4: 30-Min-Fenster vor Abholung → ready_for_dispatch
      const promoted = await promoteReservationsToReadyForDispatch(now);
      if (promoted.length > 0) {
        logger.info({ count: promoted.length, rideIds: promoted.map((r) => r.id) }, "[Cron] Reservierung → ready_for_dispatch");
      }

      // Job 5: Fahrer hat 45 min nach Abholzeit noch nicht aktiviert → 24h Sperre + Fahrt freigeben
      const activationDeadline = new Date(nowMs - 45 * 60 * 1000);
      const missedActivation = await releaseMissedActivationReservations(activationDeadline);
      const { notifyDriverMissedActivationReservation } = await import("./lib/driverRideExpoPush.js");
      for (const ride of missedActivation) {
        const did = typeof ride.driver_id === "string" ? ride.driver_id.trim() : "";
        const cid = typeof ride.company_id === "string" ? ride.company_id.trim() : "";
        if (did && cid) {
          await setReservationSuspension(did, cid, new Date(nowMs + 24 * 60 * 60 * 1000));
          logger.warn({ driverId: did, rideId: ride.id }, "[Cron] Aktivierung verpasst → 24h Sperre");
          void notifyDriverMissedActivationReservation(did, cid, ride.id);
        }
      }

      // Job 6: accepted ohne GPS-Fortschritt → zurück in Pool (Ghost-Ride Recovery)
      const { recoverGhostAcceptedRides, expireStaleOpenRides } = await import("./jobs/ghostRideRecovery.js");
      const ghostRecovered = await recoverGhostAcceptedRides(nowMs);
      if (ghostRecovered.length > 0) {
        logger.info({ count: ghostRecovered.length, rideIds: ghostRecovered }, "[Cron] Ghost-Rides recovered");
      }

      // Job 7: >8h in searching_driver / ready_for_dispatch / in_progress → expired (Test-Hänger)
      const staleExpired = await expireStaleOpenRides(nowMs);
      if (staleExpired.length > 0) {
        logger.info({ count: staleExpired.length, rideIds: staleExpired }, "[Cron] Stale open rides → expired");
      }

      // Job 8: Fahrer 5+ Min nach Abholzeit noch nicht vor Ort
      const { flagDriverLateReservations } = await import("./jobs/driverLateDetection.js");
      const lateFlagged = await flagDriverLateReservations(now);
      if (lateFlagged.length > 0) {
        logger.warn({ count: lateFlagged.length, rideIds: lateFlagged }, "[Cron] driver_late flagged");
      }

    } catch (err) {
      logger.error({ err }, "[Cron] reservationLifecycle failed");
    }
  }, 2 * 60 * 1000);

});
