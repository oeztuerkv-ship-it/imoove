/**
 * WebSocket connection fan-out + join/ping load (isolated test rides).
 * Uses Node global WebSocket (20+); no extra dependency.
 */

import { summarizeDurationsMs } from "./metrics.mjs";

const WebSocket = globalThis.WebSocket;

export async function runWsLoad({
  wsBase,
  rideId,
  token,
  connections = 20,
  messagesPerConn = 5,
  joinTimeoutMs = 5000,
}) {
  const joinLatencies = [];
  let joinOk = 0;
  let joinFail = 0;
  let msgOk = 0;
  let msgFail = 0;
  const errors = [];

  if (!WebSocket) {
    return {
      skipped: true,
      reason: "global WebSocket not available in this Node build",
      connections,
      joinOk: 0,
      joinFail: 0,
      msgOk: 0,
      msgFail: 0,
      joinStats: summarizeDurationsMs([]),
      sampleErrors: [],
    };
  }

  const url = `${wsBase.replace(/^http/, "ws")}/ws`;

  await Promise.all(
    Array.from({ length: connections }, (_, i) =>
      new Promise((resolve) => {
        const socket = new WebSocket(url);
        const joinStart = performance.now();
        let joined = false;
        let settled = false;

        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        const timer = setTimeout(() => {
          if (!joined) {
            joinFail += 1;
            errors.push(`conn${i}: join_timeout`);
          }
          try {
            socket.close();
          } catch {
            /* ignore */
          }
          finish();
        }, joinTimeoutMs);

        socket.addEventListener("open", () => {
          socket.send(
            JSON.stringify({
              type: "join",
              rideId,
              token,
            }),
          );
        });

        socket.addEventListener("message", (ev) => {
          try {
            const msg = JSON.parse(String(ev.data));
            if (msg.type === "ws_error") {
              if (!joined) {
                joinFail += 1;
                errors.push(`conn${i}: ${msg.code ?? "ws_error"}`);
                clearTimeout(timer);
                socket.close();
                finish();
              }
              return;
            }
            if (!joined && (msg.type === "joined" || msg.type === "location" || msg.rideId)) {
              joined = true;
              joinOk += 1;
              joinLatencies.push(performance.now() - joinStart);
              clearTimeout(timer);
              let sent = 0;
              const sendPing = () => {
                if (sent >= messagesPerConn) {
                  socket.close();
                  finish();
                  return;
                }
                sent += 1;
                socket.send(
                  JSON.stringify({
                    type: "driver_location",
                    lat: 48.77 + sent * 0.0001,
                    lon: 9.17 + i * 0.00001,
                  }),
                );
                msgOk += 1;
                setTimeout(sendPing, 30);
              };
              sendPing();
            }
          } catch (e) {
            msgFail += 1;
            errors.push(`conn${i}: parse ${String(e)}`);
          }
        });

        socket.addEventListener("error", () => {
          joinFail += 1;
          errors.push(`conn${i}: socket_error`);
          clearTimeout(timer);
          finish();
        });

        socket.addEventListener("close", () => {
          if (!joined) joinFail += 1;
          finish();
        });
      }),
    ),
  );

  return {
    connections,
    joinOk,
    joinFail,
    msgOk,
    msgFail,
    joinStats: summarizeDurationsMs(joinLatencies),
    sampleErrors: errors.slice(0, 8),
  };
}
