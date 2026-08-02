import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";

import { isDriverPushKind } from "@/utils/notificationAudience";
import { requestDriverPushMarketRefresh } from "@/utils/driverPushMarketRefresh";
import { PRIVATE_PICKUP_REMINDER_KIND } from "@/utils/privateReminderLocalNotifications";
import { requestOpenPrivateReminder } from "@/utils/privateReminderOpenRequest";

const HANDLED_PUSH_RESPONSE_IDS_KEY = "@onroda/handledPushResponseIds";
const MAX_HANDLED_PUSH_IDS = 50;

const CUSTOMER_RIDE_PUSH_KINDS = new Set([
  "reservation_confirmed",
  "reservation_activated",
  "reservation_dispatch_started",
  "reservation_reopened_to_market",
  "reservation_expired",
  "ride_accepted",
  "driver_arriving",
  "driver_waiting",
  "ride_in_progress",
  "ride_completed",
  "ride_cancelled_by_system",
]);

/** Abgelaufene / beendete Buchungen — nicht auf Live-Status mit alter rideId. */
const CUSTOMER_TERMINAL_PUSH_KINDS = new Set(["reservation_expired", "ride_cancelled_by_system"]);

function rideIdFromPushData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const rideId = (data as { rideId?: unknown }).rideId;
  return typeof rideId === "string" && rideId.trim().length > 0 ? rideId.trim() : null;
}

function reminderIdFromPushData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const reminderId = (data as { reminderId?: unknown }).reminderId;
  return typeof reminderId === "string" && reminderId.trim().length > 0 ? reminderId.trim() : null;
}

function kindFromPushData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const kind = (data as { kind?: unknown }).kind;
  return typeof kind === "string" ? kind : null;
}

async function shouldHandlePushResponse(
  response: { notification: { request: { identifier: string } } },
): Promise<boolean> {
  const id = response.notification.request.identifier?.trim();
  if (!id) return true;
  try {
    const raw = await AsyncStorage.getItem(HANDLED_PUSH_RESPONSE_IDS_KEY);
    const handled: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (handled.includes(id)) return false;
    const next = [id, ...handled].slice(0, MAX_HANDLED_PUSH_IDS);
    await AsyncStorage.setItem(HANDLED_PUSH_RESPONSE_IDS_KEY, JSON.stringify(next));
    return true;
  } catch {
    return true;
  }
}

function navigateForPush(kind: string | null, rideId: string | null, reminderId: string | null): void {
  if (!kind) return;
  if (kind === PRIVATE_PICKUP_REMINDER_KIND) {
    if (reminderId) requestOpenPrivateReminder(reminderId);
    router.push("/driver/dashboard");
    return;
  }
  if (isDriverPushKind(kind)) {
    requestDriverPushMarketRefresh();
    router.push("/driver/dashboard");
    return;
  }
  if (!CUSTOMER_RIDE_PUSH_KINDS.has(kind)) return;
  if (CUSTOMER_TERMINAL_PUSH_KINDS.has(kind)) {
    router.replace("/");
    return;
  }
  if (rideId) {
    router.push({ pathname: "/status", params: { rideId } });
    return;
  }
  router.push("/status");
}

/** Tap auf Push → passende App-Route (Kunde /status, Fahrer Dashboard / private Notiz). */
export function setupExpoPushResponseRouting(): () => void {
  let sub: { remove: () => void } | null = null;
  void import("expo-notifications").then(async (Notifications) => {
    const last = await Notifications.getLastNotificationResponseAsync();
    if (last && (await shouldHandlePushResponse(last))) {
      const data = last.notification.request.content.data;
      navigateForPush(kindFromPushData(data), rideIdFromPushData(data), reminderIdFromPushData(data));
    }
    sub = Notifications.addNotificationResponseReceivedListener((response) => {
      void shouldHandlePushResponse(response).then((ok) => {
        if (!ok) return;
        const data = response.notification.request.content.data;
        navigateForPush(kindFromPushData(data), rideIdFromPushData(data), reminderIdFromPushData(data));
      });
    });
  });
  return () => sub?.remove();
}
