type NotificationPermissionLike = { granted: boolean };

type NotificationsModule = typeof import("expo-notifications");

/** expo-notifications: NotificationPermissionsStatus erbt in tsc nicht zuverlässig PermissionResponse. */
function asPermissionResponse(value: unknown): NotificationPermissionLike {
  return value as NotificationPermissionLike;
}

export async function hasExpoNotificationPermission(
  Notifications: NotificationsModule,
): Promise<boolean> {
  const perm = asPermissionResponse(await Notifications.getPermissionsAsync());
  return perm.granted;
}

/**
 * Best-effort: Sound + (iOS) Time-Sensitive anfragen — Critical Alerts brauchen Extra-Entitlement (Stufe B).
 */
export async function ensureExpoNotificationPermission(
  Notifications: NotificationsModule,
): Promise<boolean> {
  const existing = asPermissionResponse(await Notifications.getPermissionsAsync());
  if (existing.granted) return true;
  try {
    const req = asPermissionResponse(
      await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowDisplayInCarPlay: false,
        },
      }),
    );
    return req.granted;
  } catch {
    const req = asPermissionResponse(await Notifications.requestPermissionsAsync());
    return req.granted;
  }
}
