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
      const { and, eq, inArray, isNotNull, lt, lte } = await import("drizzle-orm");
      const { setReservationSuspension } = await import("./db/fleetDriversData.js");
      const now = new Date();
      const nowMs = now.getTime();

      // Job 1: Kein Fahrer 10 min vor Fahrt → cancelled_by_system
      const cancelThreshold = new Date(nowMs + 10 * 60 * 1000);
      const noDriverCancelled = await db
        .update(ridesTable)
        .set({ status: "cancelled_by_system" })
        .where(and(eq(ridesTable.status, "scheduled"), isNotNull(ridesTable.scheduled_at), lte(ridesTable.scheduled_at, cancelThreshold)))
        .returning({ id: ridesTable.id, passenger_id: ridesTable.passenger_id });
      if (noDriverCancelled.length > 0) {
        logger.info({ count: noDriverCancelled.length }, "[Cron] Kein Fahrer → cancelled_by_system");
        const { notifyPassengerRideCancelledBySystem } = await import("./lib/passengerRideExpoPush.js");
        for (const row of noDriverCancelled) {
          const pid = typeof row.passenger_id === "string" ? row.passenger_id.trim() : "";
          if (pid) void notifyPassengerRideCancelledBySystem(pid, row.id);
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

      // Job 3: Fahrer hat 45 min nach Abholzeit noch nicht aktiviert → 24h Sperre + Fahrt freigeben
      const activationDeadline = new Date(nowMs - 45 * 60 * 1000);
      const missedActivation = await db
        .select({ id: ridesTable.id, driver_id: ridesTable.driver_id, company_id: ridesTable.company_id })
        .from(ridesTable)
        .where(
          and(
            eq(ridesTable.status, "scheduled_assigned"),
            isNotNull(ridesTable.scheduled_at),
            lte(ridesTable.scheduled_at, activationDeadline),
          ),
        );
      const missedIds = missedActivation.map((r) => r.id).filter((id) => id.length > 0);
      if (missedIds.length > 0) {
        await db
          .update(ridesTable)
          .set({
            status: "scheduled",
            driver_id: null,
            push_driver_activation_reminder_at: null,
            push_customer_reservation_assigned_at: null,
          })
          .where(inArray(ridesTable.id, missedIds));
      }
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

      // Job 4: scheduled_assigned in Vergangenheit → expired
      const expiredAssigned = await db
        .update(ridesTable)
        .set({ status: "expired" })
        .where(and(eq(ridesTable.status, "scheduled_assigned"), isNotNull(ridesTable.scheduled_at), lt(ridesTable.scheduled_at, now)))
        .returning({ id: ridesTable.id });
      if (expiredAssigned.length > 0) {
        logger.info({ count: expiredAssigned.length }, "[Cron] scheduled_assigned → expired");
      }

      // Job 5: scheduled in Vergangenheit → expired
      const expiredScheduled = await db
        .update(ridesTable)
        .set({ status: "expired" })
        .where(and(eq(ridesTable.status, "scheduled"), isNotNull(ridesTable.scheduled_at), lt(ridesTable.scheduled_at, now)))
        .returning({ id: ridesTable.id });
      if (expiredScheduled.length > 0) {
        logger.info({ count: expiredScheduled.length }, "[Cron] scheduled → expired");
      }

    } catch (err) {
      logger.error({ err }, "[Cron] reservationLifecycle failed");
    }
  }, 2 * 60 * 1000);

});
