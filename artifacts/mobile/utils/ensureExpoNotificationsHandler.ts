import { shouldShowExpoNotification } from "./notificationAudience";

let configured = false;

/** Einmalig: Foreground-Pushes nach Rolle/Oberfläche filtern (Fahrer-Angebot ≠ Kunde). */
export async function ensureExpoNotificationsHandler(): Promise<void> {
  if (configured) return;
  const Notifications = await import("expo-notifications");
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as { kind?: unknown } | undefined;
      const show = shouldShowExpoNotification(data);
      return {
        shouldShowAlert: show,
        shouldPlaySound: show,
        shouldSetBadge: false,
        shouldShowBanner: show,
        shouldShowList: show,
      };
    },
  });
}
