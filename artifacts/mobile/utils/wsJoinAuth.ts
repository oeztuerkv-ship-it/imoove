import AsyncStorage from "@react-native-async-storage/async-storage";

const DRIVER_SESSION_KEY = "@Onroda_driver_session";
const USER_PROFILE_KEY = "@taxi24_user_profile";

/** Fleet-JWT für WebSocket-Join (Fahrer-App). */
export async function readFleetJwtForWsJoin(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(DRIVER_SESSION_KEY).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { authToken?: string };
    const t = typeof parsed.authToken === "string" ? parsed.authToken.trim() : "";
    return t.length > 0 ? t : null;
  } catch {
    return null;
  }
}

/** Kunden-Session-JWT für WebSocket-Join (Kunden-App). */
export async function readCustomerSessionJwtForWsJoin(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(USER_PROFILE_KEY).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { sessionToken?: string };
    const t = typeof parsed.sessionToken === "string" ? parsed.sessionToken.trim() : "";
    return t.length > 0 ? t : null;
  } catch {
    return null;
  }
}
