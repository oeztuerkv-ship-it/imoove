/**
 * Smoke: MapMatchingEngine — Display-Pose, kein Snap während Reroute / stale Generation.
 *   npx tsx artifacts/mobile/utils/navEngine/MapMatchingEngine.selftest.ts
 */
import { matchMapDisplayPose } from "./MapMatchingEngine";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const poly = [
  { lat: 48.74, lon: 9.31 },
  { lat: 48.741, lon: 9.31 },
  { lat: 48.742, lon: 9.31 },
];

// Slightly east of route — should snap onto lon 9.31
const beside = { lat: 48.7405, lon: 9.3102 };
const onRoute = matchMapDisplayPose({
  filtered: beside,
  polyline: poly,
  boundRouteGeneration: 1,
  routeGeneration: 1,
  allowSnap: true,
});
assert(onRoute.snapped, "snaps when on corridor");
assert(Math.abs(onRoute.display.lon - 9.31) < 0.00005, "display on polyline");
assert(onRoute.filtered.lon === beside.lon, "filtered unchanged");
assert(!onRoute.snapSuppressed, "snap not suppressed");

// During reroute: no snap to old geometry
const reroute = matchMapDisplayPose({
  filtered: beside,
  polyline: poly,
  boundRouteGeneration: 1,
  routeGeneration: 1,
  allowSnap: false,
});
assert(!reroute.snapped, "no snap during reroute");
assert(reroute.display.lat === beside.lat && reroute.display.lon === beside.lon, "display=filtered");
assert(reroute.snapSuppressed, "snap suppressed during reroute");

// Stale generation (tick still holding old snapshot after new route bound)
const stale = matchMapDisplayPose({
  filtered: beside,
  polyline: poly,
  boundRouteGeneration: 3,
  routeGeneration: 2,
  allowSnap: true,
});
assert(!stale.snapped, "no snap on stale generation");
assert(stale.snapSuppressed, "stale snap suppressed");
assert(stale.display.lon === beside.lon, "stale → filtered display");

// New generation matches
const fresh = matchMapDisplayPose({
  filtered: beside,
  polyline: poly,
  boundRouteGeneration: 3,
  routeGeneration: 3,
  allowSnap: true,
});
assert(fresh.snapped, "new generation snaps");

console.log("MapMatchingEngine.selftest: ok");
