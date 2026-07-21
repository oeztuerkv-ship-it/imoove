/**
 * Isolated smoke checks for live-driver marker math (no React Native).
 * Run from repo root:
 *   npx tsx artifacts/mobile/utils/liveDriverMarkerMotion.selftest.ts
 */
import {
  bearingDegrees,
  haversineMeters,
  liveDriverTweenDurationMs,
  normalizeHeadingDegrees,
  shortestRotationDelta,
  LIVE_DRIVER_SNAP_DISTANCE_M,
} from "./liveDriverMarkerMotion";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function approx(a: number, b: number, tol: number, msg: string): void {
  assert(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected ~${b}`);
}

// North: same lon, higher lat → bearing ~0
approx(bearingDegrees(48.74, 9.31, 48.75, 9.31), 0, 1, "bearing north");

// East: same lat, higher lon → bearing ~90
approx(bearingDegrees(48.74, 9.31, 48.74, 9.32), 90, 2, "bearing east");

// ~111m per 0.001° lat
approx(haversineMeters(48.74, 9.31, 48.741, 9.31), 111, 15, "haversine 0.001° lat");

assert(shortestRotationDelta(350, 10) === 20, "shortest +20 across 0");
assert(shortestRotationDelta(10, 350) === -20, "shortest -20 across 0");
assert(normalizeHeadingDegrees(-90) === 270, "normalize -90");

assert(liveDriverTweenDurationMs(0) === 0, "zero dist → no tween");
assert(liveDriverTweenDurationMs(LIVE_DRIVER_SNAP_DISTANCE_M) === 0, "snap dist → no tween");
const mid = liveDriverTweenDurationMs(40, 1500);
assert(mid >= 700 && mid <= 2200, `tween mid in range, got ${mid}`);

console.log("liveDriverMarkerMotion.selftest: OK");
