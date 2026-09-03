/**
 * LocationEngine (Schritt 1) — einzige Quelle für Live-GPS-Fixes im Fahrer-Navi.
 *
 * Verantwortung:
 * - Foreground-Permission
 * - Boot-Fix + watchPosition
 * - Normalisierung Expo-Coords → NavFix (lat/lon/speed/course/nowMs)
 *
 * Nicht hier: Map-Match, Progress, Maneuver, Off-Route, Reroute, Camera, Guidance-UI.
 *
 * Hinweis: Pure Coord-Normalisierung hat keinen RN/Expo-Import (Selftests via tsx).
 */

import {
  getCurrentPositionSafe,
  requestForegroundPermissionsSafe,
  watchPositionSafe,
} from "../safeExpoLocation";
import type { NavFix } from "./types";

export type LocationCoordsLike = {
  latitude: number;
  longitude: number;
  speed?: number | null;
  heading?: number | null;
};

/** iOS: distanceInterval; Android: timeInterval — Werte wie bisher im Navi-Screen. */
export const DRIVER_NAV_LOCATION_DISTANCE_INTERVAL_M = 2;
export const DRIVER_NAV_LOCATION_TIME_INTERVAL_MS = 1000;

function isFiniteCoord(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}

/**
 * Expo-/Roh-Koordinaten → NavFix. Ungültige Koordinaten → null (kein Tick).
 * speed/heading können -1 oder null sein (iOS) — unverändert durchreichen;
 * Geschwindigkeitsauflösung bleibt in der Nav-Pipeline (resolveNavSpeedMps).
 */
export function locationCoordsToNavFix(
  coords: LocationCoordsLike,
  nowMs: number = Date.now(),
): NavFix | null {
  const lat = coords.latitude;
  const lon = coords.longitude;
  if (!isFiniteCoord(lat, lon)) return null;
  return {
    lat,
    lon,
    speedMps: coords.speed ?? null,
    courseDeg: coords.heading ?? null,
    nowMs,
  };
}

export type DriverNavLocationSession = {
  stop: () => void;
};

/**
 * Startet Boot-Fix + Watch. Callbacks dürfen sich über Refs ändern —
 * die Session selbst hängt nicht an React-Callback-Identitäten.
 */
export async function startDriverNavLocationSession(handlers: {
  onFix: (fix: NavFix) => void;
  /** Erster Fix (getCurrentPosition); wenn null/fehlend, kommt der erste Watch-Fix. */
  onBootFix?: (fix: NavFix) => void;
}): Promise<DriverNavLocationSession | null> {
  // Lazy: Expo Location nur im Session-Pfad (kein Top-Level-RN für Selftests).
  const Location = await import("expo-location");
  const accuracy = Location.Accuracy.BestForNavigation;

  const fg = await requestForegroundPermissionsSafe();
  if (!fg || fg.status !== "granted") return null;

  const boot = await getCurrentPositionSafe({ accuracy });
  if (boot) {
    const bootFix = locationCoordsToNavFix(boot.coords, Date.now());
    if (bootFix) {
      (handlers.onBootFix ?? handlers.onFix)(bootFix);
    }
  }

  const sub = await watchPositionSafe(
    {
      accuracy,
      timeInterval: DRIVER_NAV_LOCATION_TIME_INTERVAL_MS,
      distanceInterval: DRIVER_NAV_LOCATION_DISTANCE_INTERVAL_M,
    },
    (loc) => {
      const fix = locationCoordsToNavFix(loc.coords, Date.now());
      if (!fix) return;
      handlers.onFix(fix);
    },
  );

  if (!sub) return null;

  return {
    stop: () => {
      sub.remove();
    },
  };
}
