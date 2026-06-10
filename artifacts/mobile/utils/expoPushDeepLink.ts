import { router } from "expo-router";

import { isDriverPushKind } from "@/utils/notificationAudience";

const CUSTOMER_RIDE_PUSH_KINDS = new Set([
  "reservation_confirmed",
  "reservation_activated",
  "reservation_expired",
  "ride_accepted",
  "driver_arriving",
  "driver_waiting",
  "ride_in_progress",
  "ride_completed",
  "ride_cancelled_by_system",
]);

function rideIdFromPushData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const rideId = (data as { rideId?: unknown }).rideId;
  return typeof rideId === "string" && rideId.trim().length > 0 ? rideId.trim() : null;
}

function kindFromPushData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const kind = (data as { kind?: unknown }).kind;
  return typeof kind === "string" ? kind : null;
}

function navigateForPush(kind: string | null, rideId: string | null): void {
  if (!kind) return;
  if (isDriverPushKind(kind)) {
    router.push("/driver/dashboard");
    return;
  }
  if (!CUSTOMER_RIDE_PUSH_KINDS.has(kind)) return;
  if (rideId) {
    router.push({ pathname: "/status", params: { rideId } });
    return;
  }
  router.push("/status");
}

/** Tap auf Push → passende App-Route (Kunde /status, Fahrer Dashboard). */
export function setupExpoPushResponseRouting(): () => void {
  let sub: { remove: () => void } | null = null;
  void import("expo-notifications").then(async (Notifications) => {
    const last = await Notifications.getLastNotificationResponseAsync();
    if (last) {
      const data = last.notification.request.content.data;
      navigateForPush(kindFromPushData(data), rideIdFromPushData(data));
    }
    sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      navigateForPush(kindFromPushData(data), rideIdFromPushData(data));
    });
  });
  return () => sub?.remove();
}
