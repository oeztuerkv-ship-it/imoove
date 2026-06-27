import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import {
  DRIVER_RIDE_OFFER_CHANNEL_ID,
  DRIVER_RIDE_OFFER_PUSH_SOUND,
} from "@/constants/driverPushNotifications";
import { getApiBaseUrl } from "./apiBase";
import { ensureExpoNotificationsHandler } from "./ensureExpoNotificationsHandler";
import {
  ensureExpoNotificationPermission,
  hasExpoNotificationPermission,
} from "./expoNotificationPermissions";

const STORAGE_LAST_SYNC_AT = "onroda_driver_expo_push_sync_at_v1";
const STORAGE_LAST_TOKEN = "onroda_driver_expo_push_token_v1";
const RESYNC_INTERVAL_MS = 10 * 60 * 1000;

export type DriverPushReadyState = "ok" | "denied" | "missing";

/** Für Status-Chips: Permission + erfolgreicher Token-Sync. */
export async function isDriverPushReady(): Promise<DriverPushReadyState> {
  if (Platform.OS === "web") return "missing";
  try {
    await ensureExpoNotificationsHandler();
    const Notifications = await import("expo-notifications");
    if (!(await hasExpoNotificationPermission(Notifications))) return "denied";
    const token = (await AsyncStorage.getItem(STORAGE_LAST_TOKEN))?.trim();
    return token ? "ok" : "missing";
  } catch {
    return "missing";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type DriverPushTokenSyncResult =
  | { ok: true; tokenPrefix: string; httpStatus: number }
  | {
      ok: false;
      reason:
        | "web"
        | "missing_auth"
        | "permission_denied"
        | "missing_project_id"
        | "token_fetch_failed"
        | "invalid_token_format"
        | "api_error"
        | "exception";
      detail?: string;
      httpStatus?: number;
    };

function devLog(result: DriverPushTokenSyncResult): void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  if (result.ok) return;
  console.warn("[driver-push-sync]", result);
}

function resolveEasProjectId(Constants: {
  expoConfig?: { extra?: { eas?: { projectId?: string } } } | null;
  easConfig?: { projectId?: string } | null;
}): string {
  return (
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId?.trim() ??
    Constants.easConfig?.projectId?.trim() ??
    ""
  );
}

/**
 * Registriert das Expo-Push-Token beim Backend (Fahrer-JWT).
 * Gibt ein Ergebnis zurück (für Debug); wirft nicht.
 */
export async function syncDriverExpoPushToken(opts: {
  authToken: string;
  fleetDriverId: string;
  companyId: string;
}): Promise<DriverPushTokenSyncResult> {
  if (Platform.OS === "web") {
    const r = { ok: false as const, reason: "web" as const };
    devLog(r);
    return r;
  }
  const authToken = opts.authToken.trim();
  const fleetDriverId = opts.fleetDriverId.trim();
  const companyId = opts.companyId.trim();
  if (!authToken || !fleetDriverId || !companyId) {
    const r = {
      ok: false as const,
      reason: "missing_auth" as const,
      detail: `auth=${!!authToken} driver=${!!fleetDriverId} company=${!!companyId}`,
    };
    devLog(r);
    return r;
  }

  try {
    await ensureExpoNotificationsHandler();
    const Notifications = await import("expo-notifications");

    const granted = await ensureExpoNotificationPermission(Notifications);
    if (!granted) {
      const r = { ok: false as const, reason: "permission_denied" as const, detail: "not_granted" };
      devLog(r);
      return r;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(DRIVER_RIDE_OFFER_CHANNEL_ID, {
        name: "Neue Fahrten",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 700, 300, 700, 2000],
        sound: DRIVER_RIDE_OFFER_PUSH_SOUND,
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
      await Notifications.setNotificationChannelAsync("ride-updates", {
        name: "Fahrten-Updates",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const Constants = (await import("expo-constants")).default;
    const projectId = resolveEasProjectId(Constants);
    if (!projectId) {
      const r = {
        ok: false as const,
        reason: "missing_project_id" as const,
        detail: "Setze EXPO_PUBLIC_EAS_PROJECT_ID oder extra.eas.projectId (npx eas init).",
      };
      devLog(r);
      return r;
    }

    let token = "";
    try {
      const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });
      token = tokenRes.data?.trim() ?? "";
    } catch (err) {
      const r = {
        ok: false as const,
        reason: "token_fetch_failed" as const,
        detail: err instanceof Error ? err.message : String(err),
      };
      devLog(r);
      return r;
    }

    if (!token.startsWith("ExponentPushToken[")) {
      const r = {
        ok: false as const,
        reason: "invalid_token_format" as const,
        detail: token ? token.slice(0, 48) : "(leer)",
      };
      devLog(r);
      return r;
    }

    const API_BASE = getApiBaseUrl();
    const res = await fetch(`${API_BASE}/fleet-driver/v1/expo-push-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ expoPushToken: token }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const r = {
        ok: false as const,
        reason: "api_error" as const,
        httpStatus: res.status,
        detail: text.slice(0, 200) || res.statusText,
      };
      devLog(r);
      return r;
    }

    await AsyncStorage.multiSet([
      [STORAGE_LAST_SYNC_AT, String(Date.now())],
      [STORAGE_LAST_TOKEN, token],
    ]);

    const ok = {
      ok: true as const,
      tokenPrefix: token.slice(0, 40),
      httpStatus: res.status,
    };
    devLog(ok);
    return ok;
  } catch (err) {
    const r = {
      ok: false as const,
      reason: "exception" as const,
      detail: err instanceof Error ? err.message : String(err),
    };
    devLog(r);
    return r;
  }
}

/** Bis zu 3 Versuche (Login / ONLINE) — Token soll zuverlässig in der DB landen. */
export async function syncDriverExpoPushTokenWithRetry(
  opts: { authToken: string; fleetDriverId: string; companyId: string },
  maxAttempts = 3,
): Promise<DriverPushTokenSyncResult> {
  let last: DriverPushTokenSyncResult = { ok: false, reason: "exception", detail: "no_attempt" };
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    last = await syncDriverExpoPushToken(opts);
    if (last.ok) return last;
    if (attempt < maxAttempts - 1) await sleep(500 * (attempt + 1));
  }
  return last;
}

/**
 * Heartbeat-Helfer: erneut syncen wenn letzter Erfolg > 10 min oder Token gewechselt hat.
 */
export async function syncDriverExpoPushTokenIfStale(opts: {
  authToken: string;
  fleetDriverId: string;
  companyId: string;
}): Promise<DriverPushTokenSyncResult | null> {
  if (Platform.OS === "web") return null;
  try {
    const [[, lastAtRaw], [, lastTokenRaw]] = await AsyncStorage.multiGet([
      STORAGE_LAST_SYNC_AT,
      STORAGE_LAST_TOKEN,
    ]);
    const lastAt = Number(lastAtRaw ?? 0);
    const stale = !Number.isFinite(lastAt) || Date.now() - lastAt > RESYNC_INTERVAL_MS;
    if (!stale && lastTokenRaw) {
      await ensureExpoNotificationsHandler();
      const Notifications = await import("expo-notifications");
      const Constants = (await import("expo-constants")).default;
      const projectId = resolveEasProjectId(Constants);
      if (projectId) {
        const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });
        const current = tokenRes.data?.trim() ?? "";
        if (current && current === lastTokenRaw) return null;
      }
    }
  } catch {
    /* weiter mit Sync */
  }
  return syncDriverExpoPushTokenWithRetry(opts, 2);
}

/** Abmelden / OFFLINE: Push-Token vom Server löschen, lokalen Sync-Stand zurücksetzen. */
export async function unregisterDriverExpoPushToken(opts: { authToken: string }): Promise<void> {
  if (Platform.OS === "web") return;
  const authToken = opts.authToken.trim();
  if (!authToken) return;
  try {
    const API_BASE = getApiBaseUrl();
    await fetch(`${API_BASE}/fleet-driver/v1/expo-push-token`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken}` },
    });
  } catch {
    /* offline */
  }
  try {
    await AsyncStorage.multiRemove([STORAGE_LAST_SYNC_AT, STORAGE_LAST_TOKEN]);
  } catch {
    /* ignore */
  }
}
