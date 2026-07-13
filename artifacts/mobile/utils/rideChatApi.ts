import { getApiBaseUrl } from "@/utils/apiBase";

export type RideChatApiMessage = {
  id: string;
  senderKind: "booking_note" | "customer" | "partner" | "driver";
  senderActorId: string | null;
  body: string;
  createdAt: string;
};

type ChatListResponse = {
  ok?: boolean;
  items?: RideChatApiMessage[];
  partnerDisplayName?: string | null;
};

export type RideChatMessagesFetchResult = {
  items: RideChatApiMessage[];
  partnerDisplayName: string | null;
};

type ChatPostResponse = {
  ok?: boolean;
  message?: RideChatApiMessage;
  error?: string;
};

function normalizeApiMessage(raw: unknown): RideChatApiMessage | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = String(r.id ?? "").trim();
  const senderKind = r.senderKind ?? r.sender_kind;
  const body = typeof r.body === "string" ? r.body.trim() : "";
  const createdAt =
    typeof r.createdAt === "string"
      ? r.createdAt
      : typeof r.created_at === "string"
        ? r.created_at
        : "";
  if (!id || !body || !createdAt) return null;
  if (
    senderKind !== "booking_note" &&
    senderKind !== "customer" &&
    senderKind !== "partner" &&
    senderKind !== "driver"
  ) {
    return null;
  }
  const actorRaw = r.senderActorId ?? r.sender_actor_id;
  return {
    id,
    senderKind,
    senderActorId: typeof actorRaw === "string" && actorRaw.trim() ? actorRaw.trim() : null,
    body,
    createdAt,
  };
}

export async function fetchCustomerRideChatMessages(
  rideId: string,
  headers: Record<string, string>,
  after?: string,
): Promise<RideChatMessagesFetchResult> {
  const rid = rideId.trim();
  if (!rid) return { items: [], partnerDisplayName: null };
  const qs = after?.trim() ? `?after=${encodeURIComponent(after.trim())}` : "";
  const res = await fetch(`${getApiBaseUrl()}/customer/v1/rides/${encodeURIComponent(rid)}/chat/messages${qs}`, {
    cache: "no-store",
    headers,
  });
  if (!res.ok) return { items: [], partnerDisplayName: null };
  const data = (await res.json()) as ChatListResponse;
  if (!Array.isArray(data.items)) return { items: [], partnerDisplayName: null };
  const partnerDisplayName =
    typeof data.partnerDisplayName === "string" && data.partnerDisplayName.trim()
      ? data.partnerDisplayName.trim()
      : null;
  return {
    items: data.items.map(normalizeApiMessage).filter((m): m is RideChatApiMessage => m != null),
    partnerDisplayName,
  };
}

export async function sendCustomerRideChatMessage(
  rideId: string,
  body: string,
  headers: Record<string, string>,
  clientMessageId?: string,
): Promise<{ ok: true; message: RideChatApiMessage } | { ok: false; error: string }> {
  const rid = rideId.trim();
  const text = body.trim();
  if (!rid || !text) return { ok: false, error: "invalid_body" };
  const res = await fetch(`${getApiBaseUrl()}/customer/v1/rides/${encodeURIComponent(rid)}/chat/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      body: text,
      ...(clientMessageId?.trim() ? { clientMessageId: clientMessageId.trim() } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as ChatPostResponse;
  const message = normalizeApiMessage(data.message);
  if (!res.ok || !message) {
    return { ok: false, error: typeof data.error === "string" ? data.error : "send_failed" };
  }
  return { ok: true, message };
}

export async function fetchFleetRideChatMessages(
  rideId: string,
  headers: Record<string, string>,
  after?: string,
): Promise<RideChatMessagesFetchResult> {
  const rid = rideId.trim();
  if (!rid) return { items: [], partnerDisplayName: null };
  const qs = after?.trim() ? `?after=${encodeURIComponent(after.trim())}` : "";
  const res = await fetch(
    `${getApiBaseUrl()}/fleet-driver/v1/rides/${encodeURIComponent(rid)}/chat/messages${qs}`,
    { cache: "no-store", headers },
  );
  if (!res.ok) return { items: [], partnerDisplayName: null };
  const data = (await res.json()) as ChatListResponse;
  if (!Array.isArray(data.items)) return { items: [], partnerDisplayName: null };
  const partnerDisplayName =
    typeof data.partnerDisplayName === "string" && data.partnerDisplayName.trim()
      ? data.partnerDisplayName.trim()
      : null;
  return {
    items: data.items.map(normalizeApiMessage).filter((m): m is RideChatApiMessage => m != null),
    partnerDisplayName,
  };
}

export async function sendFleetRideChatMessage(
  rideId: string,
  body: string,
  headers: Record<string, string>,
  clientMessageId?: string,
): Promise<{ ok: true; message: RideChatApiMessage } | { ok: false; error: string }> {
  const rid = rideId.trim();
  const text = body.trim();
  if (!rid || !text) return { ok: false, error: "invalid_body" };
  const res = await fetch(
    `${getApiBaseUrl()}/fleet-driver/v1/rides/${encodeURIComponent(rid)}/chat/messages`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        body: text,
        ...(clientMessageId?.trim() ? { clientMessageId: clientMessageId.trim() } : {}),
      }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as ChatPostResponse;
  const message = normalizeApiMessage(data.message);
  if (!res.ok || !message) {
    return { ok: false, error: typeof data.error === "string" ? data.error : "send_failed" };
  }
  return { ok: true, message };
}
