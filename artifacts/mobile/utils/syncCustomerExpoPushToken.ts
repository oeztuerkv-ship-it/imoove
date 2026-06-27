import { Platform } from "react-native";
import { getApiBaseUrl } from "./apiBase";
import { ensureExpoNotificationsHandler } from "./ensureExpoNotificationsHandler";
import { ensureExpoNotificationPermission } from "./expoNotificationPermissions";

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

    const granted = await ensureExpoNotificationPermission(Notifications);
    if (!granted) return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("ride-updates", {
        name: "Fahrten-Updates",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const Constants = (await import("expo-constants")).default;
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId?.trim() ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId?.trim() ??
      "";
    if (!projectId) return;

    const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });
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
