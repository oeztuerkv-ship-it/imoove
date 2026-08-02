import { Platform } from "react-native";

import { DRIVER_RIDE_OFFER_PUSH_SOUND } from "@/constants/driverPushNotifications";
import { ensureExpoNotificationPermission } from "@/utils/expoNotificationPermissions";
import type { FleetPrivateReminder } from "@/utils/fleetPrivateRemindersApi";

export const PRIVATE_PICKUP_REMINDER_KIND = "private_pickup_reminder";
export const PRIVATE_REMINDER_ANDROID_CHANNEL = "private-reminders";

/** 1 Stunde vor Abholung. */
export const PRIVATE_REMINDER_LEAD_MS = 60 * 60 * 1000;

function notificationId(reminderId: string): string {
  return `private-reminder-${reminderId}`;
}

function buildBody(reminder: FleetPrivateReminder): string {
  const from = (reminder.fromFull || "").trim();
  const to = (reminder.toFull || "").trim();
  const route =
    from || to
      ? `${from || "—"} → ${to || "—"}`
      : reminder.note?.trim() || "Privatauftrag";
  return `Bitte nicht vergessen — Privatauftrag in 1 Stunde.\n${route}`;
}

async function ensureAndroidChannel(
  Notifications: typeof import("expo-notifications"),
): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(PRIVATE_REMINDER_ANDROID_CHANNEL, {
    name: "Privataufträge",
    importance: Notifications.AndroidImportance.HIGH,
    sound: DRIVER_RIDE_OFFER_PUSH_SOUND,
    vibrationPattern: [0, 250, 120, 250],
    enableVibrate: true,
  });
}

/**
 * Plant lokale Geräte-Benachrichtigung T−1h.
 * Kein Server-Push — nur dieses Gerät, solange die App-Berechtigung erlaubt.
 */
export async function schedulePrivateReminderNotification(
  reminder: FleetPrivateReminder,
): Promise<void> {
  try {
    const Notifications = await import("expo-notifications");
    const id = notificationId(reminder.id);
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});

    const pickupMs = Date.parse(reminder.scheduledAt);
    if (!Number.isFinite(pickupMs)) return;
    if (reminder.completedAt) return;

    const now = Date.now();
    if (pickupMs <= now) return;

    let fireAt = pickupMs - PRIVATE_REMINDER_LEAD_MS;
    // Termin näher als 1 Std.: trotzdem kurz erinnern (nicht still verlieren).
    if (fireAt <= now) {
      fireAt = now + 5_000;
    }
    if (fireAt >= pickupMs) return;

    const granted = await ensureExpoNotificationPermission(Notifications);
    if (!granted) return;

    await ensureAndroidChannel(Notifications);

    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: "Privatauftrag",
        body: buildBody(reminder),
        sound: DRIVER_RIDE_OFFER_PUSH_SOUND,
        data: {
          kind: PRIVATE_PICKUP_REMINDER_KIND,
          reminderId: reminder.id,
        },
        ...(Platform.OS === "android"
          ? { channelId: PRIVATE_REMINDER_ANDROID_CHANNEL }
          : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(fireAt),
      },
    });
  } catch {
    /* still: Speichern der Notiz darf nicht scheitern */
  }
}

export async function cancelPrivateReminderNotification(reminderId: string): Promise<void> {
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.cancelScheduledNotificationAsync(notificationId(reminderId));
  } catch {
    /* ignore */
  }
}

/** Nach Laden / Sync: alle privaten Erinnerungen neu planen. */
export async function syncPrivateReminderNotifications(
  reminders: FleetPrivateReminder[],
): Promise<void> {
  try {
    const Notifications = await import("expo-notifications");
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const keep = new Set(reminders.map((r) => notificationId(r.id)));
    await Promise.all(
      scheduled
        .filter((n) => n.identifier.startsWith("private-reminder-") && !keep.has(n.identifier))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
    );
    await Promise.all(reminders.filter((r) => !r.completedAt).map((r) => schedulePrivateReminderNotification(r)));
  } catch {
    /* ignore */
  }
}
