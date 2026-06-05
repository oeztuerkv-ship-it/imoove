import AsyncStorage from "@react-native-async-storage/async-storage";

import { USER_PROFILE_STORAGE_KEY } from "@/constants/customerSessionStorage";

export async function readStoredCustomerSessionToken(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(USER_PROFILE_STORAGE_KEY).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { sessionToken?: string };
    const token = typeof parsed.sessionToken === "string" ? parsed.sessionToken.trim() : "";
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/** Live-Token aus Context, sonst AsyncStorage (wie RideRequestContext-Storno). */
export async function resolveCustomerBearerToken(liveToken?: string | null): Promise<string | null> {
  const fromLive = typeof liveToken === "string" ? liveToken.trim() : "";
  if (fromLive.length > 0) return fromLive;
  return readStoredCustomerSessionToken();
}
