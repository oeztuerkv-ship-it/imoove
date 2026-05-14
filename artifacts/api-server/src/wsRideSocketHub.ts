import WebSocket, { WebSocketServer } from "ws";
import { findRide } from "./db/ridesData";
import { logger } from "./lib/logger";
import { resolveWsJoinPrincipal, wsJoinPrincipalMatchesRide } from "./lib/wsRideJoinAuth";
import { driverLocations, customerLocations } from "./routes/rides";

type SocketRole = "driver" | "customer";

type RideSocketMeta = { rideId: string; role: SocketRole };

const socketMeta = new WeakMap<WebSocket, RideSocketMeta>();

/** rideId → Teilnehmer (nur nach erfolgreichem Join mit gültigem JWT). */
const rooms = new Map<string, Set<WebSocket>>();

function leaveRoom(socket: WebSocket, rideId: string): void {
  const set = rooms.get(rideId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) rooms.delete(rideId);
}

function sendWsError(socket: WebSocket, code: string): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify({ type: "ws_error", code }));
  } catch {
    /* ignore */
  }
}

export function registerRideWebSockets(wss: WebSocketServer): void {
  wss.on("connection", (socket) => {
    socket.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString()) as {
          type?: string;
          rideId?: string;
          token?: string;
          auth?: string;
          lat?: number;
          lon?: number;
          text?: string;
          sender?: string;
        };
        const msgType = typeof msg.type === "string" ? msg.type : "";
        const meta = socketMeta.get(socket);

        if (msgType === "join") {
          const rideIdRaw = typeof msg.rideId === "string" ? msg.rideId.trim() : "";
          const tokenRaw = msg.token ?? msg.auth;
          if (!rideIdRaw) {
            sendWsError(socket, "join_ride_id_required");
            return;
          }
          if (typeof tokenRaw !== "string" || !tokenRaw.trim()) {
            sendWsError(socket, "join_token_required");
            return;
          }

          const principal = await resolveWsJoinPrincipal(tokenRaw);
          if (principal.kind === "invalid") {
            sendWsError(socket, "join_auth_invalid");
            return;
          }

          const ride = await findRide(rideIdRaw);
          if (!ride) {
            sendWsError(socket, "join_ride_not_found");
            return;
          }

          if (!wsJoinPrincipalMatchesRide(ride, principal)) {
            sendWsError(socket, "join_forbidden");
            logger.warn({ rideId: rideIdRaw, role: principal.kind }, "[ws] join forbidden");
            return;
          }

          const prev = socketMeta.get(socket);
          if (prev && prev.rideId !== rideIdRaw) {
            leaveRoom(socket, prev.rideId);
          }

          const role: SocketRole = principal.kind === "fleet" ? "driver" : "customer";
          socketMeta.set(socket, { rideId: rideIdRaw, role });

          if (!rooms.has(rideIdRaw)) rooms.set(rideIdRaw, new Set());
          rooms.get(rideIdRaw)!.add(socket);

          if (socket.readyState === WebSocket.OPEN) {
            try {
              socket.send(JSON.stringify({ type: "joined", rideId: rideIdRaw, role }));
            } catch {
              /* ignore */
            }
          }
          return;
        }

        if (!meta) {
          sendWsError(socket, "join_required");
          return;
        }

        const boundRideId = meta.rideId;
        const msgRideId = typeof msg.rideId === "string" ? msg.rideId.trim() : "";
        if (msgRideId && msgRideId !== boundRideId) {
          sendWsError(socket, "ride_id_mismatch");
          return;
        }

        if (msgType === "location:driver") {
          if (meta.role !== "driver") return;
          if (msg.lat == null || msg.lon == null) return;
          driverLocations.set(boundRideId, { lat: msg.lat, lon: msg.lon, updatedAt: new Date().toISOString() });
          rooms.get(boundRideId)?.forEach((client) => {
            if (client !== socket && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: "location:driver:update", lat: msg.lat, lon: msg.lon }));
            }
          });
          return;
        }

        if (msgType === "location:customer") {
          if (meta.role !== "customer") return;
          if (msg.lat == null || msg.lon == null) return;
          customerLocations.set(boundRideId, { lat: msg.lat, lon: msg.lon, updatedAt: new Date().toISOString() });
          rooms.get(boundRideId)?.forEach((client) => {
            if (client !== socket && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: "location:customer:update", lat: msg.lat, lon: msg.lon }));
            }
          });
          return;
        }

        if (msgType === "chat:ride") {
          const text = typeof msg.text === "string" ? msg.text.trim() : "";
          const sender = msg.sender === "driver" ? "driver" : "customer";
          if (!text) return;
          if (sender !== meta.role) return;
          rooms.get(boundRideId)?.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(
                JSON.stringify({
                  type: "chat:ride:update",
                  sender,
                  text,
                  ts: new Date().toISOString(),
                }),
              );
            }
          });
        }
      } catch {
        /* ignore malformed */
      }
    });

    socket.on("close", () => {
      const m = socketMeta.get(socket);
      socketMeta.delete(socket);
      if (m) leaveRoom(socket, m.rideId);
    });

    socket.on("error", () => {
      /* ignore */
    });
  });
}
