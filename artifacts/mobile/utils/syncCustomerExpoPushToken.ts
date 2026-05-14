import { Platform } from "react-native";
import { getApiBaseUrl } from "./apiBase";
import { ensureExpoNotificationsHandler } from "./ensureExpoNotificationsHandler";

/**
 * Registriert das Expo-Push-Token beim Backend (Kunden-Session).
 * Kein Throw; bei fehlender Berechtigung / Web / Fehler still ignorieren.
 */
export async function syncCustomerExpoPushToken(opts: { sessionToken: string; googleId: string }): Promise<void> {
  if (Platform.OS === "web") return;
  const sessionToken = opts.sessionToken.trim();
  const googleId = opts.googleId.trim();
  if (!sessionToken || !googleId) return;

  try {
    await ensureExpoNotificationsHandler();
    const Notifications = await import("expo-notifications");

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("ride-updates", {
        name: "Fahrten-Updates",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const Constants = (await import("expo-constants")).default;
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

    const tokenRes = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenRes.data?.trim() ?? "";
    if (!token.startsWith("ExponentPushToken[")) return;

    const API_BASE = getApiBaseUrl();
    const res = await fetch(`${API_BASE}/customer/v1/expo-push-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ expoPushToken: token }),
    });
    if (!res.ok) {
      /* Token kann ablaufen — nächster Login erneut */
    }
  } catch {
    /* ignore */
  }
}
