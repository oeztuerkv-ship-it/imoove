import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { Alert, Linking, Platform } from "react-native";

import {
  DRIVER_BG_LOCATION_TASK,
  DRIVER_BG_RIDE_STORAGE_KEY,
} from "@/tasks/driverBackgroundLocation";
import {
  getBackgroundPermissionsSafe,
  getForegroundPermissionsSafe,
  hasStartedLocationUpdatesSafe,
  requestBackgroundPermissionsSafe,
  requestForegroundPermissionsSafe,
  startLocationUpdatesSafe,
  stopLocationUpdatesSafe,
} from "@/utils/safeExpoLocation";

const PROMPT_STORAGE_KEY = "@Onroda_driver_bg_location_prompted";

const BG_LOCATION_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 5000,
  distanceInterval: 10,
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: "ONRODA Fahrt",
    notificationBody: "Standort wird für die aktive Fahrt übermittelt.",
    notificationColor: "#15803D",
  },
};

/**
 * Foreground + optional background permission with one-time driver explanation.
 */
export async function ensureDriverBackgroundLocationPermissions(options?: {
  interactive?: boolean;
}): Promise<boolean> {
  if (Platform.OS === "web") return false;

  const fgExisting = await getForegroundPermissionsSafe();
  if (!fgExisting) return false;
  if (fgExisting.status !== "granted") {
    const fgReq = await requestForegroundPermissionsSafe();
    if (!fgReq || fgReq.status !== "granted") return false;
  }

  const bgExisting = await getBackgroundPermissionsSafe();
  if (!bgExisting) return false;
  if (bgExisting.status === "granted") return true;

  if (!options?.interactive) return false;

  // iOS: wenn Permission permanent verweigert → Einstellungen öffnen
  if (bgExisting.status === "denied" && !bgExisting.canAskAgain) {
    Alert.alert(
      "Standort „Immer erlauben" erforderlich",
      "Bitte aktiviere in den Einstellungen unter Datenschutz → Ortungsdienste → ONRODA die Option „Immer".",
      [
        { text: "Abbrechen", style: "cancel" },
        { text: "Einstellungen öffnen", onPress: () => void Linking.openSettings() },
      ],
    );
    return false;
  }

  const prompted = await AsyncStorage.getItem(PROMPT_STORAGE_KEY);
  if (prompted === "1") {
    const bgReq = await requestBackgroundPermissionsSafe();
    return Boolean(bgReq && bgReq.status === "granted");
  }

  return new Promise((resolve) => {
    Alert.alert(
      "Standort „Immer erlauben“",
      "Damit Kunden deine Position auch bei gesperrtem Bildschirm sehen können, benötigt ONRODA dauerhaften Standortzugriff während aktiver Fahrten.",
      [
        {
          text: "Später",
          style: "cancel",
          onPress: () => {
            void AsyncStorage.setItem(PROMPT_STORAGE_KEY, "1");
            resolve(false);
          },
        },
        {
          text: "Weiter",
          onPress: () => {
            void (async () => {
              await AsyncStorage.setItem(PROMPT_STORAGE_KEY, "1");
              const bgReq = await requestBackgroundPermissionsSafe();
              resolve(Boolean(bgReq && bgReq.status === "granted"));
            })();
          },
        },
      ],
    );
  });
}

export async function isDriverBackgroundLocationRunning(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  return hasStartedLocationUpdatesSafe(DRIVER_BG_LOCATION_TASK);
}

/** Start background GPS uploads for an active ride (idempotent per rideId). */
export async function startDriverBackgroundLocation(rideId: string): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const id = rideId.trim();
  if (!id) return false;

  const permitted = await ensureDriverBackgroundLocationPermissions({ interactive: true });
  if (!permitted) return false;

  try {
    const running = await Location.hasStartedLocationUpdatesAsync(DRIVER_BG_LOCATION_TASK);
    const storedRide = (await AsyncStorage.getItem(DRIVER_BG_RIDE_STORAGE_KEY))?.trim();
    if (running && storedRide === id) return true;

    if (running) {
      await Location.stopLocationUpdatesAsync(DRIVER_BG_LOCATION_TASK);
    }

    await AsyncStorage.setItem(DRIVER_BG_RIDE_STORAGE_KEY, id);
    await Location.startLocationUpdatesAsync(DRIVER_BG_LOCATION_TASK, BG_LOCATION_OPTIONS);
    return true;
  } catch (e) {
    console.warn("[driverBgLocation] start failed", e);
    return false;
  }
}

/** Stop background GPS and clear active ride binding. */
export async function stopDriverBackgroundLocation(): Promise<void> {
  if (Platform.OS === "web") return;
  const running = await hasStartedLocationUpdatesSafe(DRIVER_BG_LOCATION_TASK);
  if (running) {
    await stopLocationUpdatesSafe(DRIVER_BG_LOCATION_TASK);
  }
  await AsyncStorage.removeItem(DRIVER_BG_RIDE_STORAGE_KEY).catch(() => {});
}
