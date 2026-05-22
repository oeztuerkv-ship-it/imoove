import AsyncStorage from "@react-native-async-storage/async-storage";

const DISMISSED_KEY = "onroda_driver_admin_messages_dismissed_v1";

export type DriverAdminMessage = {
  id: string;
  title: string;
  body: string;
  sentAt: string;
};

export async function loadDismissedDriverAdminMessageIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string" && x.length > 0));
  } catch {
    return new Set();
  }
}

export async function dismissDriverAdminMessageId(id: string): Promise<void> {
  const trimmed = id.trim();
  if (!trimmed) return;
  const set = await loadDismissedDriverAdminMessageIds();
  set.add(trimmed);
  const capped = [...set].slice(-200);
  await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(capped));
}

function parseMessageItems(raw: unknown): DriverAdminMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: DriverAdminMessage[] = [];
  for (const it of raw) {
    const row = it as { id?: string; title?: string; body?: string; sentAt?: string };
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const body = typeof row.body === "string" ? row.body.trim() : "";
    if (!id || !title || !body) continue;
    out.push({
      id,
      title,
      body,
      sentAt: typeof row.sentAt === "string" ? row.sentAt : "",
    });
  }
  return out;
}

/** Ungelesene Posteingang-Nachrichten (API filtert push_only + serverseitige Dismissals). */
export async function fetchDriverInboxMessages(authToken: string): Promise<DriverAdminMessage[]> {
  const token = authToken.trim();
  if (!token) return [];
  try {
    const { getApiBaseUrl } = await import("./apiBase");
    const res = await fetch(`${getApiBaseUrl()}/fleet-driver/v1/admin-messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: unknown };
    if (!res.ok || !data?.ok) return [];
    return parseMessageItems(data.items);
  } catch {
    return [];
  }
}

/** Erste Nachricht, die noch nicht per Banner weggeklickt wurde (lokales Dismiss). */
export async function fetchLatestUndismissedBannerMessage(
  authToken: string,
): Promise<DriverAdminMessage | null> {
  const [dismissed, items] = await Promise.all([
    loadDismissedDriverAdminMessageIds(),
    fetchDriverInboxMessages(authToken),
  ]);
  const next = items.find((it) => !dismissed.has(it.id));
  return next ?? null;
}
