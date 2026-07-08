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
  // Siehe jobs/reservationLifecycleCron.ts (Job 1–4, 6–10).
  setInterval(async () => {
    try {
      const { runReservationLifecycleCron } = await import("./jobs/reservationLifecycleCron.js");
      await runReservationLifecycleCron(new Date());
    } catch (err) {
      logger.error({ err }, "[Cron] reservationLifecycle failed");
    }
  }, 2 * 60 * 1000);

});
