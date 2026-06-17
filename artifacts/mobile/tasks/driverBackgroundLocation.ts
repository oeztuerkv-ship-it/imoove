/**
 * Headless background GPS for active driver rides.
 * Must be imported once at app startup (see app/_layout.tsx).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { getApiBaseUrl } from "@/utils/apiBase";
import { acceptDriverGpsFix } from "@/utils/gpsOutlierFilter";
import { readFleetJwtForWsJoin } from "@/utils/wsJoinAuth";

export const DRIVER_BG_LOCATION_TASK = "ONRODA_DRIVER_RIDE_LOCATION";
export const DRIVER_BG_RIDE_STORAGE_KEY = "@Onroda_driver_bg_ride_id";

async function postDriverLocation(rideId: string, lat: number, lon: number): Promise<void> {
  const apiBase = getApiBaseUrl();
  const token = await readFleetJwtForWsJoin();
  if (!apiBase || !token) return;
  try {
    await fetch(`${apiBase}/rides/${encodeURIComponent(rideId)}/driver-location`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ lat, lon }),
    });
  } catch {
    /* offline */
  }
}

TaskManager.defineTask(DRIVER_BG_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn("[driverBgLocation] task error", error.message);
    return;
  }
  if (!data) return;

  const rideId = (await AsyncStorage.getItem(DRIVER_BG_RIDE_STORAGE_KEY).catch(() => null))?.trim();
  if (!rideId) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  if (!Array.isArray(locations) || locations.length === 0) return;

  for (const loc of locations) {
    const { latitude, longitude } = loc.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const fix = acceptDriverGpsFix(latitude, longitude);
    if (!fix) continue;
    await postDriverLocation(rideId, fix.lat, fix.lon);
  }
});
