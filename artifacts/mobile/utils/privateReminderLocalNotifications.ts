import { Alert, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { DRIVER_RIDE_OFFER_PUSH_SOUND } from "@/constants/driverPushNotifications";
import { ensureExpoNotificationPermission } from "@/utils/expoNotificationPermissions";
import type { FleetPrivateReminder } from "@/utils/fleetPrivateRemindersApi";

export const PRIVATE_PICKUP_REMINDER_KIND = "private_pickup_reminder";
export const PRIVATE_REMINDER_ANDROID_CHANNEL = "private-reminders";

/** 1 Stunde vor Abholung. */
export const PRIVATE_REMINDER_LEAD_MS = 60 * 60 * 1000;

const IN_APP_ALERT_SHOWN_KEY = "@onroda/privateReminderInAppAlertsShown";
const MAX_STORED_ALERT_IDS = 40;

function notificationId(reminderId: string): string {
  return `private-reminder-${reminderId}`;
}

export function buildPrivateReminderBody(reminder: FleetPrivateReminder): string {
  const from = (reminder.fromFull || "").trim();
  const to = (reminder.toFull || "").trim();
  const route =
    from || to
      ? `${from || "—"} → ${to || "—"}`
      : reminder.note?.trim() || "Privatauftrag";
  return `Bitte nicht vergessen — Privatauftrag in 1 Stunde.\n${route}`;
}

function buildBody(reminder: FleetPrivateReminder): string {
  return buildPrivateReminderBody(reminder);
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

async function hasShownInAppAlert(reminderId: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(IN_APP_ALERT_SHOWN_KEY);
    const ids: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    return ids.includes(reminderId);
  } catch {
    return false;
  }
}

async function markInAppAlertShown(reminderId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(IN_APP_ALERT_SHOWN_KEY);
    const ids: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (ids.includes(reminderId)) return;
    const next = [reminderId, ...ids].slice(0, MAX_STORED_ALERT_IDS);
    await AsyncStorage.setItem(IN_APP_ALERT_SHOWN_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/**
 * In-App-Meldung (OK) zusätzlich zur lokalen System-Benachrichtigung T−1h.
 * Einmal pro Reminder-ID (AsyncStorage), damit OK nicht dauernd wiederkommt.
 */
export async function presentPrivateReminderInAppAlert(input: {
  reminderId: string;
  title?: string;
  body?: string;
  onOk?: () => void;
}): Promise<void> {
  const id = input.reminderId.trim();
  if (!id) return;
  if (await hasShownInAppAlert(id)) return;
  await markInAppAlertShown(id);
  Alert.alert(
    input.title?.trim() || "Privatauftrag",
    input.body?.trim() || "Bitte nicht vergessen — Privatauftrag in 1 Stunde.",
    [
      {
        text: "OK",
        onPress: () => {
          input.onOk?.();
        },
      },
    ],
  );
}

/** true, wenn die T−1h-Erinnerung fällig ist (Termin in der Zukunft, Lead überschritten). */
export function isPrivateReminderDueForInAppAlert(reminder: FleetPrivateReminder): boolean {
  if (reminder.completedAt) return false;
  const pickupMs = Date.parse(reminder.scheduledAt);
  if (!Number.isFinite(pickupMs)) return false;
  const now = Date.now();
  if (pickupMs <= now) return false;
  return now >= pickupMs - PRIVATE_REMINDER_LEAD_MS;
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
