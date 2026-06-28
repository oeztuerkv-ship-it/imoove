import AsyncStorage from "@react-native-async-storage/async-storage";

import { PENDING_OAUTH_STORAGE_KEY } from "@/constants/customerSessionStorage";
import type { PendingOAuthSession } from "@/utils/completeCustomerOAuthSession";

function isPendingOAuthSession(x: unknown): x is PendingOAuthSession {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as PendingOAuthSession).sessionToken === "string" &&
    (x as PendingOAuthSession).sessionToken.trim().length > 0 &&
    typeof (x as PendingOAuthSession).profile === "object" &&
    (x as PendingOAuthSession).profile !== null
  );
}

export async function savePendingOAuthSession(session: PendingOAuthSession): Promise<void> {
  await AsyncStorage.setItem(PENDING_OAUTH_STORAGE_KEY, JSON.stringify(session));
}

export async function loadPendingOAuthSession(): Promise<PendingOAuthSession | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_OAUTH_STORAGE_KEY);
    if (!raw?.trim()) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isPendingOAuthSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearPendingOAuthSession(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_OAUTH_STORAGE_KEY);
}
