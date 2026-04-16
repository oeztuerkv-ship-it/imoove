/**
 * Native WebSocket client for real-time GPS sync.
 * React Native has WebSocket built-in — no extra packages needed.
 */

import { getApiBaseUrl } from "./apiBase";

const API_BASE = getApiBaseUrl();
const WS_URL = API_BASE
  .replace(/^https:\/\//, "wss://")
  .replace(/^http:\/\//, "ws://")
  .replace(/\/api$/, "/ws");

let _ws: WebSocket | null = null;
let _rideId: string | null = null;
let _onMessage: ((msg: Record<string, unknown>) => void) | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingMessages: string[] = [];

function _connect() {
  try {
    const socket = new WebSocket(WS_URL);
    _ws = socket;

    socket.onopen = () => {
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
      if (_rideId) {
        socket.send(JSON.stringify({ type: "join", rideId: _rideId }));
      }
      if (_pendingMessages.length > 0) {
        const queued = _pendingMessages;
        _pendingMessages = [];
        queued.forEach((msg) => {
          try { socket.send(msg); } catch { /* ignore */ }
        });
      }
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as Record<string, unknown>;
        _onMessage?.(msg);
      } catch { /* ignore */ }
    };

    socket.onerror = () => { /* ignore */ };

    socket.onclose = () => {
      _ws = null;
      if (_rideId) {
        // Auto-reconnect after 4 seconds
        _reconnectTimer = setTimeout(_connect, 4000);
      }
    };
  } catch { /* ignore */ }
}

/** Connect to the backend WebSocket and join the given ride room. */
export function connectToRide(rideId: string, onMessage: (msg: Record<string, unknown>) => void) {
  disconnectSocket();
  _rideId = rideId;
  _onMessage = onMessage;
  _connect();
}

/** Send driver GPS location via WebSocket (falls back silently if not connected). */
export function sendDriverLocation(lat: number, lon: number) {
  if (_ws?.readyState === WebSocket.OPEN && _rideId) {
    _ws.send(JSON.stringify({ type: "location:driver", rideId: _rideId, lat, lon }));
  }
}

/** Send customer GPS location via WebSocket (falls back silently if not connected). */
export function sendCustomerLocation(lat: number, lon: number) {
  if (_ws?.readyState === WebSocket.OPEN && _rideId) {
    _ws.send(JSON.stringify({ type: "location:customer", rideId: _rideId, lat, lon }));
  }
}

/** Send a lightweight in-ride chat message. */
export function sendRideChat(text: string, sender: "customer" | "driver") {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (!_rideId) return;
  const payload = JSON.stringify({ type: "chat:ride", rideId: _rideId, text: trimmed, sender });
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(payload);
    return;
  }
  // Fallback: queue message and ensure reconnect, so chat does not silently disappear.
  _pendingMessages.push(payload);
  if (!_ws) _connect();
}

/** Disconnect and clean up. */
export function disconnectSocket() {
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  _ws?.close();
  _ws = null;
  _rideId = null;
  _onMessage = null;
  _pendingMessages = [];
}
