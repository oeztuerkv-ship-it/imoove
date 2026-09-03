/**
 * Pure Coord → NavFix (kein Expo/RN — Selftests via tsx).
 * Session-Start: siehe LocationEngine.ts.
 */

import type { NavFix } from "./types";

export type LocationCoordsLike = {
  latitude: number;
  longitude: number;
  speed?: number | null;
  heading?: number | null;
};

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
 * speed/heading können -1 oder null sein (iOS) — unverändert durchreichen.
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
