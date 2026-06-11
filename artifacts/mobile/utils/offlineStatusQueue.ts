import AsyncStorage from "@react-native-async-storage/async-storage";

const QUEUE_KEY = "onroda_offline_status_patch_queue_v1";

export type QueuedStatusPatch = {
  id: string;
  rideId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  createdAt: string;
};

async function readQueue(): Promise<QueuedStatusPatch[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as QueuedStatusPatch[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedStatusPatch[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export async function enqueueOfflineStatusPatch(item: Omit<QueuedStatusPatch, "id" | "createdAt">): Promise<void> {
  const queue = await readQueue();
  queue.push({
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
  });
  await writeQueue(queue);
}

export async function flushOfflineStatusQueue(): Promise<number> {
  const queue = await readQueue();
  if (queue.length === 0) return 0;
  const remaining: QueuedStatusPatch[] = [];
  let sent = 0;
  for (const item of queue) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
      if (res.ok) {
        sent += 1;
      } else {
        remaining.push(item);
      }
    } catch {
      remaining.push(item);
    }
  }
  await writeQueue(remaining);
  return sent;
}
