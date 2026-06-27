import type { PermissionResponse } from "expo-modules-core";

type NotificationsModule = typeof import("expo-notifications");

/** expo-notifications: NotificationPermissionsStatus erbt in tsc nicht zuverlässig PermissionResponse. */
function asPermissionResponse(value: unknown): PermissionResponse {
  return value as PermissionResponse;
}

export async function hasExpoNotificationPermission(
  Notifications: NotificationsModule,
): Promise<boolean> {
  const perm = asPermissionResponse(await Notifications.getPermissionsAsync());
  return perm.granted;
}

export async function ensureExpoNotificationPermission(
  Notifications: NotificationsModule,
): Promise<boolean> {
  const existing = asPermissionResponse(await Notifications.getPermissionsAsync());
  if (existing.granted) return true;
  const req = asPermissionResponse(await Notifications.requestPermissionsAsync());
  return req.granted;
}
