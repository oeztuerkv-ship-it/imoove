import { Alert, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { DRIVER_RIDE_OFFER_PUSH_SOUND } from "@/constants/driverPushNotifications";
import { ensureExpoNotificationPermission } from "@/utils/expoNotificationPermissions";
import type { FleetPrivateReminder } from "@/utils/fleetPrivateRemindersApi";

export const PRIVATE_PICKUP_REMINDER_KIND = "private_pickup_reminder";
export const PRIVATE_REMINDER_ANDROID_CHANNEL = "private-reminders";

/** 1 Stunde vor Abholung. */
export const PRIVATE_REMINDER_LEAD_MS = 60 * 60 * 1000;

/** System-Push / In-App: gleiche Kernaussage. */
export const PRIVATE_REMINDER_PUSH_TITLE = "Privatauftrag";
export const PRIVATE_REMINDER_PUSH_BODY =
  "Nicht vergessen –\nDein Privatauftrag beginnt in 1 Stunde.";

/** v5: Speichern erst bei OK — sonst nach Restart keine Meldung mehr. */
const IN_APP_ALERT_SHOWN_KEY = "@onroda/privateReminderInAppAlertsShown_v5";
/** Lokale OS-Notification schon ausgelöst (verhindert Endlos-+5s-Reschedule). */
const LOCAL_NOTIF_FIRED_KEY = "@onroda/privateReminderLocalNotifFired_v1";
const MAX_STORED_ALERT_IDS = 40;

export type PrivateReminderInAppPresentInput = {
  reminderId: string;
  title?: string;
  body?: string;
  /** Start → Ziel für Modal (schwarz). */
  routeLine?: string;
  onOk?: () => void;
};

/** Dashboard registriert Custom-Modal; sonst Fallback Alert. */
let privateReminderInAppPresenter:
  | ((input: PrivateReminderInAppPresentInput) => void)
  | null = null;

/** Verhindert Doppel-Open in derselben Anzeige; wird bei Unmount/OK geleert. */
const inAppInflightIds = new Set<string>();

export function setPrivateReminderInAppPresenter(
  presenter: ((input: PrivateReminderInAppPresentInput) => void) | null,
): void {
  privateReminderInAppPresenter = presenter;
}

export function clearPrivateReminderInAppInflight(): void {
  inAppInflightIds.clear();
}

export async function markPrivateReminderInAppAlertShown(reminderId: string): Promise<void> {
  const id = reminderId.trim();
  if (!id) return;
  await markInAppAlertShown(id);
  inAppInflightIds.delete(id);
}

function notificationId(reminderId: string): string {
  return `private-reminder-${reminderId}`;
}

export function privateReminderRouteLine(reminder: FleetPrivateReminder): string {
  const from = (reminder.fromFull || "").trim();
  const to = (reminder.toFull || "").trim();
  if (from || to) return `${from || "—"} → ${to || "—"}`;
  return reminder.note?.trim() || "";
}

/** Push-Body inkl. optionaler Route. */
export function buildPrivateReminderBody(reminder: FleetPrivateReminder): string {
  const route = privateReminderRouteLine(reminder);
  return route ? `${PRIVATE_REMINDER_PUSH_BODY}\n${route}` : PRIVATE_REMINDER_PUSH_BODY;
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

async function readIdList(key: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function writeIdList(key: string, ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(ids.slice(0, MAX_STORED_ALERT_IDS)));
  } catch {
    /* ignore */
  }
}

async function hasShownInAppAlert(reminderId: string): Promise<boolean> {
  return (await readIdList(IN_APP_ALERT_SHOWN_KEY)).includes(reminderId);
}

async function markInAppAlertShown(reminderId: string): Promise<void> {
  const ids = await readIdList(IN_APP_ALERT_SHOWN_KEY);
  if (ids.includes(reminderId)) return;
  await writeIdList(IN_APP_ALERT_SHOWN_KEY, [reminderId, ...ids]);
}

async function waitForInAppPresenter(maxMs = 800): Promise<boolean> {
  if (privateReminderInAppPresenter) return true;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 40));
    if (privateReminderInAppPresenter) return true;
  }
  return privateReminderInAppPresenter != null;
}

async function hasLocalNotifFired(reminderId: string): Promise<boolean> {
  return (await readIdList(LOCAL_NOTIF_FIRED_KEY)).includes(reminderId);
}

async function markLocalNotifFired(reminderId: string): Promise<void> {
  const ids = await readIdList(LOCAL_NOTIF_FIRED_KEY);
  if (ids.includes(reminderId)) return;
  await writeIdList(LOCAL_NOTIF_FIRED_KEY, [reminderId, ...ids]);
}

/**
 * In-App-Meldung zusätzlich zur lokalen System-Benachrichtigung T−1h.
 * Speichern erst bei OK — nach App-Restart erneut zeigen, solange fällig und kein OK.
 */
export async function presentPrivateReminderInAppAlert(
  input: PrivateReminderInAppPresentInput,
): Promise<void> {
  const id = input.reminderId.trim();
  if (!id) return;
  if (await hasShownInAppAlert(id)) return;
  if (inAppInflightIds.has(id)) return;
  inAppInflightIds.add(id);

  const payload: PrivateReminderInAppPresentInput = {
    ...input,
    reminderId: id,
    onOk: () => {
      void markPrivateReminderInAppAlertShown(id);
      input.onOk?.();
    },
  };

  const hasPresenter = await waitForInAppPresenter();
  if (hasPresenter && privateReminderInAppPresenter) {
    privateReminderInAppPresenter(payload);
    return;
  }

  // Fallback, falls Dashboard noch nicht gemountet
  Alert.alert(
    input.title?.trim() || PRIVATE_REMINDER_PUSH_TITLE,
    input.body?.trim() || PRIVATE_REMINDER_PUSH_BODY,
    [
      {
        text: "OK",
        onPress: () => {
          void markPrivateReminderInAppAlertShown(id);
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

function scheduledTriggerDateMs(trigger: unknown): number | null {
  if (!trigger || typeof trigger !== "object") return null;
  const t = trigger as { type?: string; date?: unknown; value?: unknown };
  const raw = t.date ?? t.value;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === "string") {
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

async function findExistingScheduleMs(
  Notifications: typeof import("expo-notifications"),
  id: string,
): Promise<number | null> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    const hit = all.find((n) => n.identifier === id);
    if (!hit) return null;
    return scheduledTriggerDateMs(hit.trigger);
  } catch {
    return null;
  }
}

function notificationContent(reminder: FleetPrivateReminder) {
  return {
    title: PRIVATE_REMINDER_PUSH_TITLE,
    body: buildBody(reminder),
    sound: DRIVER_RIDE_OFFER_PUSH_SOUND,
    data: {
      kind: PRIVATE_PICKUP_REMINDER_KIND,
      reminderId: reminder.id,
    },
    ...(Platform.OS === "android" ? { channelId: PRIVATE_REMINDER_ANDROID_CHANNEL } : {}),
  };
}

/**
 * Plant lokale Geräte-Benachrichtigung T−1h.
 * Kein blindes Cancel+Reschedule: sonst wandert „jetzt+5s“ bei jedem Sync weiter → mal so, mal so.
 */
export async function schedulePrivateReminderNotification(
  reminder: FleetPrivateReminder,
): Promise<void> {
  try {
    const Notifications = await import("expo-notifications");
    const id = notificationId(reminder.id);

    const pickupMs = Date.parse(reminder.scheduledAt);
    if (!Number.isFinite(pickupMs)) return;
    if (reminder.completedAt) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      return;
    }

    const now = Date.now();
    if (pickupMs <= now) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      return;
    }

    const granted = await ensureExpoNotificationPermission(Notifications);
    if (!granted) return;

    await ensureAndroidChannel(Notifications);

    const idealFireAt = pickupMs - PRIVATE_REMINDER_LEAD_MS;
    const existingMs = await findExistingScheduleMs(Notifications, id);

    // Noch >15s bis Idealzeitpunkt: einmal planen und belassen.
    if (idealFireAt > now + 15_000) {
      if (existingMs != null && Math.abs(existingMs - idealFireAt) < 60_000) {
        return;
      }
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: notificationContent(reminder),
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(idealFireAt),
        },
      });
      return;
    }

    // Bereits im 1-Std.-Fenster: OS-Notification einmal sofort, nicht erneut +5s schieben.
    if (await hasLocalNotifFired(reminder.id)) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      return;
    }

    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: notificationContent(reminder),
      trigger: null,
    });
    await markLocalNotifFired(reminder.id);
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

/** Nach Laden / Sync: alle privaten Erinnerungen neu planen (idempotent). */
export async function syncPrivateReminderNotifications(
  reminders: FleetPrivateReminder[],
): Promise<void> {
  try {
    const Notifications = await import("expo-notifications");
    const open = reminders.filter((r) => !r.completedAt);
    const keep = new Set(open.map((r) => notificationId(r.id)));
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.identifier.startsWith("private-reminder-") && !keep.has(n.identifier))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
    );
    // Sequentiell: weniger Race mit Cancel/Schedule auf demselben Identifier.
    for (const r of open) {
      await schedulePrivateReminderNotification(r);
    }
  } catch {
    /* ignore */
  }
}
