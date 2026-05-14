/**
 * HTTP- und WebSocket-Server. Routing, CORS und API-Pfad-Spiegelung (`/api` + Root) liegen in `./app`.
 */
import "./loadEnv";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import app from "./app";
import { seedAdminDefaultsIfEmpty } from "./db/adminData";
import { logger } from "./lib/logger";
import { driverLocations, customerLocations } from "./routes/rides";

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

// Ride rooms: rideId → Set<WebSocket>
const rooms = new Map<string, Set<WebSocket>>();

wss.on("connection", (socket) => {
  let rideId: string | null = null;

  socket.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as {
        type: string;
        rideId?: string;
        lat?: number;
        lon?: number;
      };

      if (msg.type === "join" && msg.rideId) {
        rideId = msg.rideId;
        if (!rooms.has(rideId)) rooms.set(rideId, new Set());
        rooms.get(rideId)!.add(socket);
      }

      if (msg.type === "location:driver" && rideId && msg.lat != null && msg.lon != null) {
        driverLocations.set(rideId, { lat: msg.lat, lon: msg.lon, updatedAt: new Date().toISOString() });
        rooms.get(rideId)?.forEach((client) => {
          if (client !== socket && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "location:driver:update", lat: msg.lat, lon: msg.lon }));
          }
        });
      }

      if (msg.type === "location:customer" && rideId && msg.lat != null && msg.lon != null) {
        customerLocations.set(rideId, { lat: msg.lat, lon: msg.lon, updatedAt: new Date().toISOString() });
        rooms.get(rideId)?.forEach((client) => {
          if (client !== socket && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "location:customer:update", lat: msg.lat, lon: msg.lon }));
          }
        });
      }

      if (msg.type === "chat:ride" && rideId) {
        const text = typeof (msg as { text?: unknown }).text === "string"
          ? (msg as { text: string }).text.trim()
          : "";
        const sender = (msg as { sender?: unknown }).sender === "driver" ? "driver" : "customer";
        if (!text) return;
        rooms.get(rideId)?.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: "chat:ride:update",
              sender,
              text,
              ts: new Date().toISOString(),
            }));
          }
        });
      }
    } catch { /* ignore malformed messages */ }
  });

  socket.on("close", () => {
    if (rideId) {
      rooms.get(rideId)?.delete(socket);
      if (rooms.get(rideId)?.size === 0) rooms.delete(rideId);
    }
  });

  socket.on("error", () => { /* ignore */ });
});

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening");
  void seedAdminDefaultsIfEmpty().catch((err) => {
    logger.error({ err }, "seedAdminDefaultsIfEmpty failed");
  });

  // ── Hintergrund-Jobs: Reservierungs-Lifecycle alle 2 Minuten ──
  setInterval(async () => {
    try {
      const { db } = await import("./db/client.js");
      const { ridesTable } = await import("./db/schema.js");
      const { and, eq, isNotNull, lt, lte } = await import("drizzle-orm");
      const { setReservationSuspension } = await import("./db/fleetDriversData.js");
      const now = new Date();
      const nowMs = now.getTime();

      // Job 1: Kein Fahrer 10 min vor Fahrt → cancelled_by_system
      const cancelThreshold = new Date(nowMs + 10 * 60 * 1000);
      const noDriverCancelled = await db
        .update(ridesTable)
        .set({ status: "cancelled_by_system" })
        .where(and(eq(ridesTable.status, "scheduled"), isNotNull(ridesTable.scheduled_at), lte(ridesTable.scheduled_at, cancelThreshold)))
        .returning({ id: ridesTable.id });
      if (noDriverCancelled.length > 0) {
        logger.info({ count: noDriverCancelled.length }, "[Cron] Kein Fahrer → cancelled_by_system");
      }

      // Job 2: Fahrer hat 45 min Aktivierung verpasst → 24h Sperre + Fahrt freigeben
      const activationDeadline = new Date(nowMs - 45 * 60 * 1000);
      const missedActivation = await db
        .update(ridesTable)
        .set({ status: "scheduled", driver_id: null })
        .where(and(eq(ridesTable.status, "scheduled_assigned"), isNotNull(ridesTable.scheduled_at), lte(ridesTable.scheduled_at, activationDeadline)))
        .returning({ id: ridesTable.id, driver_id: ridesTable.driver_id, company_id: ridesTable.company_id });
      for (const ride of missedActivation) {
        if (ride.driver_id && ride.company_id) {
          await setReservationSuspension(ride.driver_id, ride.company_id, new Date(nowMs + 24 * 60 * 60 * 1000));
          logger.warn({ driverId: ride.driver_id, rideId: ride.id }, "[Cron] Aktivierung verpasst → 24h Sperre");
        }
      }

      // Job 3: scheduled_assigned in Vergangenheit → expired
      const expiredAssigned = await db
        .update(ridesTable)
        .set({ status: "expired" })
        .where(and(eq(ridesTable.status, "scheduled_assigned"), isNotNull(ridesTable.scheduled_at), lt(ridesTable.scheduled_at, now)))
        .returning({ id: ridesTable.id });
      if (expiredAssigned.length > 0) {
        logger.info({ count: expiredAssigned.length }, "[Cron] scheduled_assigned → expired");
      }

      // Job 4: scheduled in Vergangenheit → expired
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
