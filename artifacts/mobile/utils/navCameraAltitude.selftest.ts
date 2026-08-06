/**
 * Smoke: Apple Maps Zoom→Altitude (kein RN).
 *   npx tsx artifacts/mobile/utils/navCameraAltitude.selftest.ts
 */
import {
  NAV_CAMERA_ALTITUDE_MIN_M,
  clampNavCameraAltitudeM,
  isPlausibleNavCameraAltitudeM,
  metersPerPixelAtZoom,
  zoomLevelToAltitudeMeters,
} from "./navCameraAltitude";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const mpp = metersPerPixelAtZoom(16.5, 48.669);
assert(mpp > 0.8 && mpp < 1.5, `mpp@16.5 should be ~1.1m, got ${mpp}`);

const alt = zoomLevelToAltitudeMeters(16.5, 48.669);
assert(alt >= 800 && alt <= 1500, `altitude@16.5 should be ~1km, got ${alt}`);
assert(alt !== mpp, "altitude must NOT equal meters-per-pixel");

assert(!isPlausibleNavCameraAltitudeM(1.115), "1.1m is m/px bug, not altitude");
assert(!isPlausibleNavCameraAltitudeM(50), "50m below min");
assert(isPlausibleNavCameraAltitudeM(alt), "computed altitude plausible");

assert(clampNavCameraAltitudeM(1.115) >= NAV_CAMERA_ALTITUDE_MIN_M, "clamp lifts 1.1m");
assert(clampNavCameraAltitudeM(1e9) <= 20_000, "clamp caps huge");

console.log("navCameraAltitude.selftest: OK");
