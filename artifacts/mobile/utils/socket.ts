/**
 * Native WebSocket client for real-time GPS sync + in-ride chat.
 */

import { AppState, type AppStateStatus } from "react-native";

import { getApiBaseUrl } from "./apiBase";

const API_BASE = getApiBaseUrl();
const WS_URL = API_BASE
  .replace(/^https:\/\//, "wss://")
  .replace(/^http:\/\//, "ws://")
  .replace(/\/api$/, "/ws");

let _ws: WebSocket | null = null;
let _rideId: string | null = null;
let _onMessage: ((msg: Record<string, unknown>) => void) | null = null;
let _onWsError: ((code: string) => void) | null = null;
let _getJoinToken: (() => Promise<string | null>) | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingMessages: string[] = [];
let _appActive = true;

function _scheduleReconnect() {
  if (_reconnectTimer || !_rideId) return;
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    if (_rideId && _appActive) _connect();
  }, 2500);
}

async function _sendJoin(socket: WebSocket) {
  if (socket !== _ws || !_rideId || !_getJoinToken) return;
  const token = await _getJoinToken();
  if (socket !== _ws) return;
  try {
    socket.send(
      JSON.stringify({
        type: "join",
        rideId: _rideId,
        token: token ?? "",
      }),
    );
  } catch {
    /* ignore */
  }
}

function _flushPending(socket: WebSocket) {
  if (socket !== _ws || _pendingMessages.length === 0) return;
  const queued = _pendingMessages;
  _pendingMessages = [];
  queued.forEach((msg) => {
    try {
      socket.send(msg);
    } catch {
      /* ignore */
    }
  });
}

function _connect() {
  if (!_rideId || !_appActive) return;
  try {
    const socket = new WebSocket(WS_URL);
    _ws = socket;

    socket.onopen = () => {
      if (_reconnectTimer) {
        clearTimeout(_reconnectTimer);
        _reconnectTimer = null;
      }
      void (async () => {
        await _sendJoin(socket);
        if (socket !== _ws) return;
        _flushPending(socket);
      })();
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as Record<string, unknown>;
        const type = typeof msg.type === "string" ? msg.type : "";
        if (type === "ws_error") {
          const code = typeof msg.code === "string" ? msg.code : "ws_error";
          _onWsError?.(code);
          if (code === "join_auth_invalid" || code === "join_forbidden" || code === "join_token_required") {
            void _sendJoin(socket);
          }
          return;
        }
        _onMessage?.(msg);
      } catch {
        /* ignore */
      }
    };

    socket.onerror = () => {
      /* onclose handles reconnect */
    };

    socket.onclose = () => {
      if (_ws === socket) _ws = null;
      _scheduleReconnect();
    };
  } catch {
    _scheduleReconnect();
  }
}

/**
 * Connect to the backend WebSocket and join the given ride room.
 * `getJoinToken` muss das Fleet-JWT bzw. Kunden-Session-JWT liefern (Server prüft Zuordnung zur Fahrt).
 */
export function connectToRide(
  rideId: string,
  onMessage: (msg: Record<string, unknown>) => void,
  getJoinToken: () => Promise<string | null>,
  onWsError?: (code: string) => void,
) {
  disconnectSocket();
  _rideId = rideId;
  _onMessage = onMessage;
  _getJoinToken = getJoinToken;
  _onWsError = onWsError ?? null;
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

export type RideChatSendOpts = {
  text: string;
  sender: "customer" | "driver";
  replyTo?: { from: "customer" | "driver"; text: string };
};

/** Send a lightweight in-ride chat message (queued + reconnect if socket down). */
export function sendRideChat(opts: RideChatSendOpts) {
  const trimmed = opts.text.trim();
  if (!trimmed || !_rideId) return;
  const payload = JSON.stringify({
    type: "chat:ride",
    rideId: _rideId,
    text: trimmed,
    sender: opts.sender,
    ...(opts.replyTo
      ? { replyToText: opts.replyTo.text, replyToSender: opts.replyTo.from }
      : {}),
  });
  if (_ws?.readyState === WebSocket.OPEN) {
    try {
      _ws.send(payload);
    } catch {
      _pendingMessages.push(payload);
      _connect();
    }
    return;
  }
  _pendingMessages.push(payload);
  _connect();
}

/** Disconnect and clean up. */
export function disconnectSocket() {
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
  _ws?.close();
  _ws = null;
  _rideId = null;
  _onMessage = null;
  _onWsError = null;
  _getJoinToken = null;
  _pendingMessages = [];
}

/** Pause reconnect while app is backgrounded; resume + reconnect when active. */
let _appStateSub: { remove: () => void } | null = null;

export function bindSocketAppStateLifecycle() {
  if (_appStateSub) return;
  _appStateSub = AppState.addEventListener("change", (next: AppStateStatus) => {
    const active = next === "active";
    _appActive = active;
    if (active && _rideId && (!_ws || _ws.readyState !== WebSocket.OPEN)) {
      _connect();
    }
  });
}

bindSocketAppStateLifecycle();
