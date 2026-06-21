import WebSocket, { WebSocketServer } from "ws";
import { persistDriverLocationPing } from "./db/rideDriverLocationData";
import { findRide } from "./db/ridesData";
import { logger } from "./lib/logger";
import { resolveWsJoinPrincipal, wsJoinPrincipalMatchesRide } from "./lib/wsRideJoinAuth";
import { driverLocations, customerLocations } from "./routes/rides";

type SocketRole = "driver" | "customer" | "partner";

type RideSocketMeta = { rideId: string; role: SocketRole; fleetDriverId?: string };

const socketMeta = new WeakMap<WebSocket, RideSocketMeta>();

/** rideId → Teilnehmer (nur nach erfolgreichem Join mit gültigem JWT). */
const rooms = new Map<string, Set<WebSocket>>();

const JOIN_IDLE_TIMEOUT_MS = 15_000;

function rejectJoin(socket: WebSocket, code: string, closeReason?: string): void {
  sendWsError(socket, code);
  if (socket.readyState === WebSocket.OPEN) {
    socket.close(4403, closeReason ?? code);
  }
}

/** Live-Status an alle WS-Clients im Fahrt-Room (nach Cron oder PATCH). */
export function broadcastToRideRoom(rideId: string, payload: Record<string, unknown>): void {
  const set = rooms.get(rideId.trim());
  if (!set || set.size === 0) return;
  const msg = JSON.stringify(payload);
  set.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(msg);
      } catch {
        /* ignore */
      }
    }
  });
}

export function broadcastRideStatusChange(
  rideId: string,
  status: string,
  previousStatus?: string,
): void {
  broadcastToRideRoom(rideId, {
    type: "ride:status:update",
    rideId,
    status,
    ...(previousStatus ? { previousStatus } : {}),
    ts: new Date().toISOString(),
  });
}

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
    const joinIdleTimer = setTimeout(() => {
      if (!socketMeta.has(socket) && socket.readyState === WebSocket.OPEN) {
        sendWsError(socket, "join_timeout");
        socket.close(4401, "join_timeout");
      }
    }, JOIN_IDLE_TIMEOUT_MS);

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
          replyToText?: string;
          replyToSender?: string;
        };
        const msgType = typeof msg.type === "string" ? msg.type : "";
        const meta = socketMeta.get(socket);

        if (msgType === "join") {
          const rideIdRaw = typeof msg.rideId === "string" ? msg.rideId.trim() : "";
          const tokenRaw = msg.token ?? msg.auth;
          if (!rideIdRaw) {
            rejectJoin(socket, "join_ride_id_required");
            return;
          }
          if (typeof tokenRaw !== "string" || !tokenRaw.trim()) {
            rejectJoin(socket, "join_token_required");
            return;
          }

          const principal = await resolveWsJoinPrincipal(tokenRaw);
          if (principal.kind === "invalid") {
            rejectJoin(socket, "join_auth_invalid");
            return;
          }

          const ride = await findRide(rideIdRaw);
          if (!ride) {
            rejectJoin(socket, "join_ride_not_found");
            return;
          }

          if (!wsJoinPrincipalMatchesRide(ride, principal)) {
            logger.warn({ rideId: rideIdRaw, role: principal.kind }, "[ws] join forbidden");
            rejectJoin(socket, "join_forbidden");
            return;
          }

          clearTimeout(joinIdleTimer);

          const prev = socketMeta.get(socket);
          if (prev && prev.rideId !== rideIdRaw) {
            leaveRoom(socket, prev.rideId);
          }

          const role: SocketRole =
            principal.kind === "fleet"
              ? "driver"
              : principal.kind === "panel"
                ? "partner"
                : "customer";
          socketMeta.set(socket, {
            rideId: rideIdRaw,
            role,
            fleetDriverId: principal.kind === "fleet" ? principal.fleetDriverId : undefined,
          });

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
          const updatedAt = new Date().toISOString();
          driverLocations.set(boundRideId, { lat: msg.lat, lon: msg.lon, updatedAt });
          if (meta.fleetDriverId) {
            void findRide(boundRideId).then((ride) => {
              if (!ride) return;
              void persistDriverLocationPing({
                rideId: boundRideId,
                fleetDriverId: meta.fleetDriverId!,
                lat: msg.lat,
                lon: msg.lon,
                rideStatus: ride.status,
              });
            });
          }
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
          const replyToText =
            typeof msg.replyToText === "string" ? msg.replyToText.trim() : "";
          const replyToSender =
            msg.replyToSender === "driver"
              ? "driver"
              : msg.replyToSender === "customer"
                ? "customer"
                : null;
          const replyPayload =
            replyToText && replyToSender
              ? { replyTo: { sender: replyToSender, text: replyToText } }
              : {};
          const ts = new Date().toISOString();
          rooms.get(boundRideId)?.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(
                JSON.stringify({
                  type: "chat:ride:update",
                  sender,
                  text,
                  ts,
                  ...replyPayload,
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
      clearTimeout(joinIdleTimer);
      const m = socketMeta.get(socket);
      socketMeta.delete(socket);
      if (m) leaveRoom(socket, m.rideId);
    });

    socket.on("error", () => {
      /* ignore */
    });
  });
}
