/** In-Fahrt-Chat: REST-Persistenz + WS-Echo (kein dauerhafter Kanal nach Fahrtende). */

import type { RequestStatus } from "@/context/RideRequestContext";
import type { RideChatApiMessage } from "@/utils/rideChatApi";

export type RideChatSender = "driver" | "customer";
export type RideChatUiSender = RideChatSender | "partner" | "booking_note";

export type RideChatReplyTarget = { from: RideChatSender; text: string };

export type RideChatMessage = {
  id: string;
  from: RideChatUiSender;
  text: string;
  createdAt?: string;
  replyTo?: RideChatReplyTarget;
  /** Optimistische Nachricht, bis Echo vom Server kommt. */
  pending?: boolean;
};

const CHAT_TERMINAL_STATUSES = new Set<RequestStatus>([
  "completed",
  "cancelled_by_customer",
  "cancelled_by_driver",
  "cancelled_by_system",
  "customer_abort_pending_fare",
  "cancelled",
  "rejected",
  "expired",
]);

export function isRideChatSendAllowed(status: RequestStatus, chatEnabled?: boolean | null): boolean {
  if (!chatEnabled) return false;
  return !CHAT_TERMINAL_STATUSES.has(status);
}

export function rideChatMessageId(ts: string, from: RideChatUiSender, text: string): string {
  return `${ts}|${from}|${text}`;
}

export function apiMessageToRideChatMessage(m: RideChatApiMessage): RideChatMessage {
  return {
    id: m.id,
    from: m.senderKind,
    text: m.body,
    createdAt: m.createdAt,
  };
}

export function rideChatMessagesFromApi(items: RideChatApiMessage[]): RideChatMessage[] {
  return items.map(apiMessageToRideChatMessage);
}

export function parseRideChatUpdate(msg: Record<string, unknown>): RideChatMessage | null {
  const id = typeof msg.id === "string" ? msg.id.trim() : "";
  const bodyNew = typeof msg.body === "string" ? msg.body.trim() : "";
  const senderKindRaw = msg.senderKind ?? msg.sender_kind;
  if (id && bodyNew) {
    const from: RideChatUiSender | null =
      senderKindRaw === "driver" ||
      senderKindRaw === "customer" ||
      senderKindRaw === "partner" ||
      senderKindRaw === "booking_note"
        ? senderKindRaw
        : null;
    if (!from) return null;
    const createdAt =
      typeof msg.createdAt === "string"
        ? msg.createdAt
        : typeof msg.created_at === "string"
          ? msg.created_at
          : undefined;
    return { id, from, text: bodyNew, ...(createdAt ? { createdAt } : {}) };
  }

  const sender = msg.sender === "driver" ? "driver" : msg.sender === "customer" ? "customer" : null;
  if (!sender) return null;
  const text = typeof msg.text === "string" ? msg.text.trim() : "";
  if (!text) return null;
  const ts = typeof msg.ts === "string" ? msg.ts : new Date().toISOString();
  let replyTo: RideChatMessage["replyTo"];
  const rawReply = msg.replyTo;
  if (rawReply && typeof rawReply === "object") {
    const r = rawReply as Record<string, unknown>;
    const rFrom = r.sender === "driver" ? "driver" : r.sender === "customer" ? "customer" : null;
    const rText = typeof r.text === "string" ? r.text.trim() : "";
    if (rFrom && rText) replyTo = { from: rFrom, text: rText };
  }
  return {
    id: rideChatMessageId(ts, sender, text),
    from: sender,
    text,
    ...(replyTo ? { replyTo } : {}),
  };
}

export function mergeRideChatMessages(prev: RideChatMessage[], incoming: RideChatMessage): RideChatMessage[] {
  const withoutPendingDup = prev.filter(
    (p) =>
      !(
        p.pending &&
        p.from === incoming.from &&
        p.text === incoming.text &&
        ((!p.replyTo && !incoming.replyTo) ||
          (p.replyTo?.text === incoming.replyTo?.text && p.replyTo?.from === incoming.replyTo?.from))
      ),
  );
  if (withoutPendingDup.some((p) => p.id === incoming.id)) return withoutPendingDup;
  return [...withoutPendingDup, incoming].slice(-100);
}

export function mergeRideChatMessagesFromApi(
  prev: RideChatMessage[],
  items: RideChatMessage[],
): RideChatMessage[] {
  let merged = prev;
  for (const item of items) {
    merged = mergeRideChatMessages(merged, item);
  }
  return merged.slice(-100);
}

export function rideChatSenderLabel(
  from: RideChatUiSender,
  opts?: { partnerDisplayName?: string | null },
): string {
  const partnerName = opts?.partnerDisplayName?.trim();
  if (from === "booking_note") return partnerName || "Buchungshinweis";
  if (from === "partner") return partnerName || "Partner";
  if (from === "driver") return "Fahrer";
  return "Kunde";
}
