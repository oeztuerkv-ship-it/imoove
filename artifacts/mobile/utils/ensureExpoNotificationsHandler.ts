import { shouldShowExpoNotification, shouldPresentDriverRideOfferNotification } from "./notificationAudience";

const DRIVER_OFFER_PUSH_KINDS = new Set([
  "instant_ride_offer",
  "follow_up_offer",
  "scheduled_pool_offer",
  "funk_dispatch_offer",
]);

let configured = false;

/** Einmalig: Foreground-Pushes nach Rolle/Oberfläche filtern (Fahrer-Angebot ≠ Kunde). */
export async function ensureExpoNotificationsHandler(): Promise<void> {
  if (configured) return;
  const Notifications = await import("expo-notifications");
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as { kind?: unknown } | undefined;
      const kind = typeof data?.kind === "string" ? data.kind : "";
      const show = shouldShowExpoNotification(data);
      const localOfferAlarm =
        DRIVER_OFFER_PUSH_KINDS.has(kind) && shouldPresentDriverRideOfferNotification();
      return {
        shouldShowAlert: show,
        // Kurzer System-Pipser vermeiden — voller Alarm über ringForDriverInstantOffer (expo-av).
        shouldPlaySound: show && !localOfferAlarm,
        shouldSetBadge: false,
        shouldShowBanner: show,
        shouldShowList: show,
      };
    },
  });
}
