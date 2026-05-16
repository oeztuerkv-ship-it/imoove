/** In-Fahrt-Chat (WebSocket, kein Persistenz-Backend). */

export type RideChatSender = "driver" | "customer";

export type RideChatMessage = {
  id: string;
  from: RideChatSender;
  text: string;
  replyTo?: { from: RideChatSender; text: string };
  /** Optimistische Nachricht, bis Echo vom Server kommt. */
  pending?: boolean;
};

export function rideChatMessageId(ts: string, from: RideChatSender, text: string): string {
  return `${ts}|${from}|${text}`;
}

export function parseRideChatUpdate(msg: Record<string, unknown>): RideChatMessage | null {
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
