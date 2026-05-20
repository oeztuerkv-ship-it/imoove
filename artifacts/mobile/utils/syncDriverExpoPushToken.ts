import { Platform } from "react-native";
import { getApiBaseUrl } from "./apiBase";
import { ensureExpoNotificationsHandler } from "./ensureExpoNotificationsHandler";

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
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn("[driver-push-sync]", result);
  }
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

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") {
      const r = { ok: false as const, reason: "permission_denied" as const, detail: status };
      devLog(r);
      return r;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("ride-offers", {
        name: "Neue Fahrten",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 300, 200, 300],
        sound: "default",
        enableVibrate: true,
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
