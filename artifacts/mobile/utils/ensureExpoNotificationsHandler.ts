let configured = false;

/** Einmalig: Foreground-Verhalten für eingehende Pushs (Kunde + Fahrer). */
export async function ensureExpoNotificationsHandler(): Promise<void> {
  if (configured) return;
  const Notifications = await import("expo-notifications");
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
