import * as Location from "expo-location";

/** Native host (Dev Build) ohne NSLocation*-Keys in Info.plist — kein Crash. */
export function isMissingLocationPlistError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("NSLocation") && message.includes("Info.plist");
}

export async function getForegroundPermissionsSafe(): Promise<Location.PermissionResponse | null> {
  try {
    return await Location.getForegroundPermissionsAsync();
  } catch (error) {
    if (isMissingLocationPlistError(error)) {
      console.warn("[location] Foreground permission unavailable — rebuild iOS dev client after app.json change.");
      return null;
    }
    throw error;
  }
}

export async function requestForegroundPermissionsSafe(): Promise<Location.PermissionResponse | null> {
  try {
    return await Location.requestForegroundPermissionsAsync();
  } catch (error) {
    if (isMissingLocationPlistError(error)) {
      console.warn("[location] Foreground permission unavailable — rebuild iOS dev client after app.json change.");
      return null;
    }
    throw error;
  }
}

export async function getBackgroundPermissionsSafe(): Promise<Location.PermissionResponse | null> {
  try {
    return await Location.getBackgroundPermissionsAsync();
  } catch (error) {
    if (isMissingLocationPlistError(error)) {
      console.warn("[location] Background permission unavailable — rebuild iOS dev client after app.json change.");
      return null;
    }
    throw error;
  }
}

export async function requestBackgroundPermissionsSafe(): Promise<Location.PermissionResponse | null> {
  try {
    return await Location.requestBackgroundPermissionsAsync();
  } catch (error) {
    if (isMissingLocationPlistError(error)) {
      console.warn("[location] Background permission unavailable — rebuild iOS dev client after app.json change.");
      return null;
    }
    throw error;
  }
}

export async function getCurrentPositionSafe(
  options?: Location.LocationOptions,
): Promise<Location.LocationObject | null> {
  try {
    return await Location.getCurrentPositionAsync(options);
  } catch (error) {
    if (isMissingLocationPlistError(error)) {
      console.warn("[location] getCurrentPosition unavailable — rebuild iOS dev client after app.json change.");
      return null;
    }
    throw error;
  }
}

export async function watchPositionSafe(
  options: Location.LocationOptions,
  callback: Location.LocationCallback,
): Promise<Location.LocationSubscription | null> {
  try {
    return await Location.watchPositionAsync(options, callback);
  } catch (error) {
    if (isMissingLocationPlistError(error)) {
      console.warn("[location] watchPosition unavailable — rebuild iOS dev client after app.json change.");
      return null;
    }
    throw error;
  }
}
