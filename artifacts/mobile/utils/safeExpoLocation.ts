import * as Location from "expo-location";

/** Native Host (Dev Build ohne Prebuild) oder veralteter iOS-Build — kein Crash. */
export function isMissingLocationPlistError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    (message.includes("NSLocation") && message.includes("Info.plist")) ||
    message.includes("NSLocation*UsageDescription") ||
    message.includes("to be able to use geolocation")
  );
}

function logMissingPlistHint(): void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.warn(
    "[location] NSLocation*-Keys fehlen im nativen Build — App neu bauen: cd artifacts/mobile && npx expo run:ios (oder Expo Go mit pnpm run dev:go).",
  );
}

export async function getForegroundPermissionsSafe(): Promise<Location.PermissionResponse | null> {
  try {
    return await Location.getForegroundPermissionsAsync();
  } catch (error) {
    if (isMissingLocationPlistError(error)) {
      logMissingPlistHint();
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
      logMissingPlistHint();
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
      logMissingPlistHint();
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
      logMissingPlistHint();
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
      logMissingPlistHint();
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
      logMissingPlistHint();
      return null;
    }
    throw error;
  }
}

export async function hasStartedLocationUpdatesSafe(taskName: string): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(taskName);
  } catch (error) {
    if (isMissingLocationPlistError(error)) {
      logMissingPlistHint();
      return false;
    }
    throw error;
  }
}

export async function startLocationUpdatesSafe(
  taskName: string,
  options: Location.LocationTaskOptions,
): Promise<boolean> {
  try {
    await Location.startLocationUpdatesAsync(taskName, options);
    return true;
  } catch (error) {
    if (isMissingLocationPlistError(error)) {
      logMissingPlistHint();
      return false;
    }
    throw error;
  }
}

export async function stopLocationUpdatesSafe(taskName: string): Promise<void> {
  try {
    await Location.stopLocationUpdatesAsync(taskName);
  } catch (error) {
    if (isMissingLocationPlistError(error)) return;
    throw error;
  }
}
