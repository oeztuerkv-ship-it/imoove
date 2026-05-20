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
