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
  // Job 4: nur offene `scheduled` → `searching_driver` (T−30). Zugewiesene nur per Fahrer-Tap.
  // Siehe jobs/reservationLifecycleCron.ts (Job 1–4, 6–10).
  const runReservationLifecycleTick = async () => {
    try {
      const { runReservationLifecycleCron } = await import("./jobs/reservationLifecycleCron.js");
      return await runReservationLifecycleCron(new Date());
    } catch (err) {
      logger.error({ err }, "[Cron] reservationLifecycle failed");
      return null;
    }
  };

  logger.info(
    { intervalMs: 2 * 60 * 1000 },
    "[Cron] reservationLifecycle armed (Job 4: T−30 nur scheduled→searching_driver; assigned nur manuell)",
  );
  void runReservationLifecycleTick();
  setInterval(() => {
    void runReservationLifecycleTick();
  }, 2 * 60 * 1000);

  // Partner-Monatsreport: 1. des Monats 08:00 Europe/Berlin (Tick alle 15 Min, Idempotenz in DB)
  const runPartnerMonthlyReportTick = async () => {
    try {
      const { runPartnerMonthlyReportCronTick } = await import("./jobs/partnerMonthlyReportCron.js");
      await runPartnerMonthlyReportCronTick(new Date());
    } catch (err) {
      logger.error({ err }, "[Cron] partnerMonthlyReport failed");
    }
  };
  logger.info(
    { intervalMs: 15 * 60 * 1000 },
    "[Cron] partnerMonthlyReport armed (1. des Monats 08:00 Europe/Berlin)",
  );
  void runPartnerMonthlyReportTick();
  setInterval(() => {
    void runPartnerMonthlyReportTick();
  }, 15 * 60 * 1000);

  // Funk-Dispatch: Angebot-Timeout 45 s → nächster Fahrer (Tick alle 10 s)
  const runFunkDispatchTick = async () => {
    try {
      const { runFunkDispatchTimeoutTick } = await import("./db/funkDispatchData.js");
      await runFunkDispatchTimeoutTick(new Date());
    } catch (err) {
      logger.error({ err }, "[Cron] funkDispatch timeout tick failed");
    }
  };
  logger.info({ intervalMs: 10_000 }, "[Cron] funkDispatch armed (45s exclusive offer timeout)");
  void runFunkDispatchTick();
  setInterval(() => {
    void runFunkDispatchTick();
  }, 10_000);

});
