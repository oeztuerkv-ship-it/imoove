import { API_BASE } from "./apiBase.js";

function normalizeMessage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id ?? "").trim();
  const senderKind = raw.senderKind ?? raw.sender_kind;
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  const createdAt =
    typeof raw.createdAt === "string"
      ? raw.createdAt
      : typeof raw.created_at === "string"
        ? raw.created_at
        : "";
  if (!id || !body || !createdAt) return null;
  if (!["booking_note", "customer", "partner", "driver"].includes(senderKind)) return null;
  return { id, senderKind, body, createdAt };
}

export function partnerChatSenderLabel(kind) {
  switch (kind) {
    case "partner":
      return "Ihr Team";
    case "driver":
      return "Fahrer";
    case "customer":
      return "Kunde";
    case "booking_note":
      return "Buchungsnotiz";
    default:
      return "System";
  }
}

export async function fetchPartnerRideChatMessages(token, rideId) {
  if (!token || !rideId) return { ok: false, items: [], chatEnabled: false };
  const res = await fetch(`${API_BASE}/panel/v1/rides/${encodeURIComponent(rideId)}/chat/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, items: [], chatEnabled: false, error: data?.error };
  const items = Array.isArray(data.items)
    ? data.items.map(normalizeMessage).filter(Boolean)
    : [];
  return { ok: true, items, chatEnabled: Boolean(data.chatEnabled) };
}

export async function sendPartnerRideChatMessage(token, rideId, body) {
  const text = String(body ?? "").trim();
  if (!token || !rideId || !text) return { ok: false, error: "invalid_body" };
  const res = await fetch(`${API_BASE}/panel/v1/rides/${encodeURIComponent(rideId)}/chat/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body: text, clientMessageId: `pp-${Date.now()}` }),
  });
  const data = await res.json().catch(() => ({}));
  const message = normalizeMessage(data.message);
  if (!res.ok || !message) {
    return { ok: false, error: typeof data.error === "string" ? data.error : "send_failed" };
  }
  return { ok: true, message };
}
