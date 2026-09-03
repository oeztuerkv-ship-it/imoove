/**
 * Smoke: LocationEngine Coord → NavFix.
 *   npx tsx artifacts/mobile/utils/navEngine/LocationEngine.selftest.ts
 */
import { locationCoordsToNavFix } from "./locationCoordsToNavFix";
import { createLocationWatchGuard } from "./navLifecycle";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const ok = locationCoordsToNavFix(
  { latitude: 48.74, longitude: 9.31, speed: 12.5, heading: 90 },
  1_700_000_000_000,
);
assert(!!ok, "valid coords → fix");
assert(ok!.lat === 48.74 && ok!.lon === 9.31, "lat/lon");
assert(ok!.speedMps === 12.5, "speed");
assert(ok!.courseDeg === 90, "course");
assert(ok!.nowMs === 1_700_000_000_000, "nowMs");

const iosNeg = locationCoordsToNavFix({
  latitude: 48.74,
  longitude: 9.31,
  speed: -1,
  heading: -1,
});
assert(!!iosNeg, "iOS -1 speed/heading still yields fix");
assert(iosNeg!.speedMps === -1, "speed -1 passthrough");
assert(iosNeg!.courseDeg === -1, "heading -1 passthrough");

const bad = locationCoordsToNavFix({ latitude: NaN, longitude: 9.31 });
assert(bad === null, "NaN lat → null");

const missingSpeed = locationCoordsToNavFix({ latitude: 48.7, longitude: 9.3 });
assert(!!missingSpeed, "missing speed ok");
assert(missingSpeed!.speedMps === null && missingSpeed!.courseDeg === null, "null defaults");

{
  const g = createLocationWatchGuard();
  g.start();
  g.stop();
  g.stop();
  const e = g.start();
  g.stop();
  assert(!g.isLive(e), "watch start/stop idempotent");
}

console.log("LocationEngine.selftest: ok");
