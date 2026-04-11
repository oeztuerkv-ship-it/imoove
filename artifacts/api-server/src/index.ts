/**
 * HTTP- und WebSocket-Server. Routing, CORS und API-Pfad-Spiegelung (`/api` + Root) liegen in `./app`.
 */
import "./loadEnv";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import app from "./app";
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
});
