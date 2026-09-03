/**
 * LocationEngine (Schritt 1) — einzige Quelle für Live-GPS-Fixes im Fahrer-Navi.
 *
 * Verantwortung:
 * - Foreground-Permission
 * - Boot-Fix + watchPosition
 * - Normalisierung Expo-Coords → NavFix (lat/lon/speed/course/nowMs)
 * - max. ein Watch; Start/Stop idempotent; alte Callbacks ignorieren
 *
 * Nicht hier: Map-Match, Progress, Maneuver, Off-Route, Reroute, Camera, Guidance-UI.
 */

import {
  getCurrentPositionSafe,
  requestForegroundPermissionsSafe,
  watchPositionSafe,
} from "../safeExpoLocation";
import { createLocationWatchGuard } from "./navLifecycle";
import { locationCoordsToNavFix } from "./locationCoordsToNavFix";
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

export type DriverNavLocationSession = {
  stop: () => void;
};

const watchGuard = createLocationWatchGuard();
let removeWatch: (() => void) | null = null;

function removeWatchSafe(): void {
  const rm = removeWatch;
  removeWatch = null;
  if (!rm) return;
  try {
    rm();
  } catch {
    /* doppeltes remove / null native handle */
  }
}

/** Stoppt den Modul-Watch. Mehrfach aufrufen ist sicher. */
export function stopDriverNavLocationSession(): void {
  watchGuard.stop();
  removeWatchSafe();
}

/**
 * Startet Boot-Fix + Watch. Maximal ein aktiver Watch.
 * Callbacks nur wenn Epoch noch live und `isLive()` true (Screen: mounted + session).
 */
export async function startDriverNavLocationSession(handlers: {
  onFix: (fix: NavFix) => void;
  /** Erster Fix (getCurrentPosition); wenn null/fehlend, kommt der erste Watch-Fix. */
  onBootFix?: (fix: NavFix) => void;
  isLive?: () => boolean;
}): Promise<DriverNavLocationSession | null> {
  stopDriverNavLocationSession();
  const epoch = watchGuard.start();
  const live = () => watchGuard.isLive(epoch) && (handlers.isLive?.() ?? true);

  const Location = await import("expo-location");
  if (!live()) return null;
  const accuracy = Location.Accuracy.BestForNavigation;

  const fg = await requestForegroundPermissionsSafe();
  if (!live()) return null;
  if (!fg || fg.status !== "granted") {
    stopDriverNavLocationSession();
    return null;
  }

  const boot = await getCurrentPositionSafe({ accuracy });
  if (!live()) return null;
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
      if (!live()) return;
      const fix = locationCoordsToNavFix(loc.coords, Date.now());
      if (!fix) return;
      handlers.onFix(fix);
    },
  );

  if (!live()) {
    try {
      sub?.remove();
    } catch {
      /* ignore */
    }
    return null;
  }
  if (!sub) {
    stopDriverNavLocationSession();
    return null;
  }

  removeWatch = () => {
    try {
      sub.remove();
    } catch {
      /* ignore */
    }
  };

  return {
    stop: () => {
      stopDriverNavLocationSession();
    },
  };
}
