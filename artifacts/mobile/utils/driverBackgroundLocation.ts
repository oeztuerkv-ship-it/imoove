import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { Alert, Linking, Platform } from "react-native";

import {
  DRIVER_BG_LOCATION_TASK,
  DRIVER_BG_MODE_STORAGE_KEY,
  DRIVER_BG_RIDE_STORAGE_KEY,
  DRIVER_ONLINE_PING_INTERVAL_MS,
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

export type DriverPresenceMode = "online" | "ride";

const RIDE_LOCATION_OPTIONS: Location.LocationTaskOptions = {
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

const ONLINE_LOCATION_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: DRIVER_ONLINE_PING_INTERVAL_MS,
  distanceInterval: 200,
  foregroundService: {
    notificationTitle: "ONRODA — Online",
    notificationBody: "Bereit für Aufträge in deiner Nähe.",
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

  if (bgExisting.status === "denied" && !bgExisting.canAskAgain) {
    Alert.alert(
      "Standort „Immer erlauben“ erforderlich",
      "Bitte aktiviere in den Einstellungen unter Datenschutz → Ortungsdienste → ONRODA die Option „Immer“.",
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
      "Damit du im ONLINE-Modus Aufträge in deiner Nähe erhältst und Kunden deine Position bei aktiven Fahrten sehen, benötigt ONRODA dauerhaften Standortzugriff.",
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

export async function getDriverPresenceSnapshot(): Promise<{
  fgsRunning: boolean;
  mode: DriverPresenceMode | null;
}> {
  if (Platform.OS === "web") return { fgsRunning: false, mode: null };
  const fgsRunning = await isDriverBackgroundLocationRunning();
  const modeRaw = (await AsyncStorage.getItem(DRIVER_BG_MODE_STORAGE_KEY).catch(() => null))?.trim();
  const mode = modeRaw === "online" || modeRaw === "ride" ? modeRaw : null;
  return { fgsRunning, mode };
}

export async function isDriverPresenceOnlineModeRunning(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const snap = await getDriverPresenceSnapshot();
  return snap.fgsRunning && snap.mode === "online";
}

async function stopLocationTaskIfRunning(): Promise<void> {
  const running = await hasStartedLocationUpdatesSafe(DRIVER_BG_LOCATION_TASK);
  if (running) {
    await stopLocationUpdatesSafe(DRIVER_BG_LOCATION_TASK);
  }
}

async function startPresenceMode(
  mode: DriverPresenceMode,
  rideId: string | null,
  options: Location.LocationTaskOptions,
): Promise<boolean> {
  if (Platform.OS === "web") return false;

  try {
    const snap = await getDriverPresenceSnapshot();
    const storedRide = (await AsyncStorage.getItem(DRIVER_BG_RIDE_STORAGE_KEY).catch(() => null))?.trim() ?? "";
    const sameMode = snap.mode === mode && snap.fgsRunning;
    if (mode === "ride" && rideId && sameMode && storedRide === rideId) return true;
    if (mode === "online" && sameMode && !storedRide) return true;

    await stopLocationTaskIfRunning();

    await AsyncStorage.setItem(DRIVER_BG_MODE_STORAGE_KEY, mode);
    if (mode === "ride" && rideId) {
      await AsyncStorage.setItem(DRIVER_BG_RIDE_STORAGE_KEY, rideId);
    } else {
      await AsyncStorage.removeItem(DRIVER_BG_RIDE_STORAGE_KEY);
    }

    await startLocationUpdatesSafe(DRIVER_BG_LOCATION_TASK, options);
    return true;
  } catch (e) {
    console.warn("[driverPresence] start failed", mode, e);
    return false;
  }
}

/** Android ONLINE: FGS + Markt-Ping (~2 min). */
export async function startDriverPresenceOnlineMode(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const permitted = await ensureDriverBackgroundLocationPermissions({ interactive: true });
  if (!permitted) return false;
  return startPresenceMode("online", null, ONLINE_LOCATION_OPTIONS);
}

/** Aktive Fahrt: FGS + Ride-Upload (5 s). */
export async function startDriverPresenceRideMode(rideId: string): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const id = rideId.trim();
  if (!id) return false;

  const permitted = await ensureDriverBackgroundLocationPermissions({ interactive: true });
  if (!permitted) return false;
  return startPresenceMode("ride", id, RIDE_LOCATION_OPTIONS);
}

/**
 * Zentraler Schalter: RIDE hat Vorrang; danach Android-ONLINE; sonst alles stoppen.
 * A6: Nach Fahrtende bei weiter ONLINE → RIDE→ONLINE ohne vollständigen Stop.
 */
export async function syncDriverPresenceState(opts: {
  isMarketOnline: boolean;
  activeRideId?: string | null;
}): Promise<{ ok: boolean; onlineServiceStarted: boolean }> {
  const rideId = opts.activeRideId?.trim() || null;

  if (rideId) {
    const ok = await startDriverPresenceRideMode(rideId);
    return { ok, onlineServiceStarted: ok };
  }

  if (opts.isMarketOnline && Platform.OS === "android") {
    const ok = await startDriverPresenceOnlineMode();
    return { ok, onlineServiceStarted: ok };
  }

  await stopDriverPresenceEntirely();
  return { ok: true, onlineServiceStarted: false };
}

/** Logout / OFFLINE: Task stoppen, Bindings löschen. */
export async function stopDriverPresenceEntirely(): Promise<void> {
  if (Platform.OS === "web") return;
  await stopLocationTaskIfRunning();
  await AsyncStorage.multiRemove([DRIVER_BG_RIDE_STORAGE_KEY, DRIVER_BG_MODE_STORAGE_KEY]).catch(() => {});
}

/** @deprecated Nutze syncDriverPresenceState / stopDriverPresenceEntirely. */
export async function startDriverBackgroundLocation(rideId: string): Promise<boolean> {
  return startDriverPresenceRideMode(rideId);
}

/** @deprecated Nutze stopDriverPresenceEntirely wenn wirklich alles aus; sonst syncDriverPresenceState. */
export async function stopDriverBackgroundLocation(): Promise<void> {
  await stopDriverPresenceEntirely();
}
