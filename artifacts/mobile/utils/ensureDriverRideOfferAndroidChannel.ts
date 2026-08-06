import { Platform } from "react-native";
import {
  DRIVER_RIDE_OFFER_CHANNEL_DESCRIPTION,
  DRIVER_RIDE_OFFER_CHANNEL_ID,
  DRIVER_RIDE_OFFER_CHANNEL_NAME,
  DRIVER_RIDE_OFFER_PUSH_SOUND,
} from "@/constants/driverPushNotifications";

/**
 * Android: High-Priority-Kanal für Fahrtangebote (MAX + Custom-Sound + Ringtone-AudioAttributes).
 * Idempotent; neuer Channel-ID-Stand, weil Importance/Sound nach create nicht zuverlässig änderbar sind.
 */
export async function ensureDriverRideOfferAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  const Notifications = await import("expo-notifications");
  await Notifications.setNotificationChannelAsync(DRIVER_RIDE_OFFER_CHANNEL_ID, {
    name: DRIVER_RIDE_OFFER_CHANNEL_NAME,
    description: DRIVER_RIDE_OFFER_CHANNEL_DESCRIPTION,
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 800, 400, 800, 400, 800, 1200],
    sound: DRIVER_RIDE_OFFER_PUSH_SOUND,
    enableVibrate: true,
    enableLights: true,
    showBadge: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      flags: {
        enforceAudibility: true,
        requestHardwareAudioVideoSynchronization: false,
      },
    },
  });
}
