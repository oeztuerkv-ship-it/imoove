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

const alt175 = zoomLevelToAltitudeMeters(17.5, 48.669);
assert(alt175 >= 180 && alt175 <= 350, `altitude@17.5 city-nav ~230m, got ${alt175}`);
assert(alt175 !== mpp, "altitude must NOT equal meters-per-pixel");

const alt18 = zoomLevelToAltitudeMeters(18.0, 48.669);
assert(alt18 < alt175, "closer zoom → lower altitude");
assert(alt18 >= NAV_CAMERA_ALTITUDE_MIN_M, "still above min");

assert(!isPlausibleNavCameraAltitudeM(1.115), "1.1m is m/px bug, not altitude");
assert(!isPlausibleNavCameraAltitudeM(50), "50m below min");
assert(isPlausibleNavCameraAltitudeM(alt175), "computed altitude plausible");

assert(clampNavCameraAltitudeM(1.115) >= NAV_CAMERA_ALTITUDE_MIN_M, "clamp lifts 1.1m");
assert(clampNavCameraAltitudeM(1e9) <= 12_000, "clamp caps huge");

console.log("navCameraAltitude.selftest: OK");
