/**
 * NavigationState P2: headingState authoritative, no dest bearing, no heading 0.
 *   npx tsx artifacts/mobile/utils/navEngine/NavigationState.selftest.ts
 */
import { NAV_HEADING_TRUST_COURSE_SPEED_MPS } from "../navHeadingSmoother";
import { createNavEngineState, resetNavEngineForRoute, tickNavEngine } from "./NavigationEngine";
import {
  commitHeadingQuality,
  commitNavigationFromLegacyPose,
  createNavigationState,
  mirrorsFromNavigationState,
} from "./NavigationState";
import type { NavRouteSnapshot } from "./types";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const idle = createNavigationState();
assert(idle.gpsState === "LOST", "boot gps LOST");
assert(idle.headingState === "LOST", "boot heading LOST");
assert(idle.heading === null, "boot heading not 0");
assert(idle.lastValidHeading === null, "boot no last valid");
assert(idle.routeState === "idle", "boot route idle");

const route: NavRouteSnapshot = {
  polyline: [
    { lat: 48.74, lon: 9.31 },
    { lat: 48.741, lon: 9.31 },
  ],
  steps: [
    {
      instruction: "Weiterfahren",
      distanceM: 100,
      lat: 48.7405,
      lon: 9.31,
    },
  ],
  authoritativeDistM: 110,
  authoritativeEtaMin: 2,
  generation: 1,
};

let engine = createNavEngineState();
engine = resetNavEngineForRoute(engine, route, { lat: 48.74, lon: 9.31 });
assert(engine.runtime.routeGeneration === 1, "reset binds generation");
assert(engine.runtime.routeState === "navigating", "reset → navigating");
assert(engine.runtime.headingState === "LOST", "reset does not invent route heading");

const tick = tickNavEngine(
  engine,
  {
    lat: 48.7402,
    lon: 9.31,
    speedMps: 8,
    courseDeg: 90,
    accuracyM: 5,
    headingAccuracyDeg: 12,
    nowMs: 2_000,
  },
  route,
);

assert(tick.navigation === tick.state.runtime, "navigation alias is same object");
assert(tick.navigation.gpsState === "ACTIVE", "tick → ACTIVE");
assert(tick.navigation.rawPosition?.lat === 48.7402, "rawPosition from fix");
assert(tick.navigation.displayPosition != null, "display set");
assert(tick.navigation.accuracy === 5, "accuracy passthrough");
assert(tick.navigation.headingAccuracy === 12, "headingAccuracy passthrough");
assert(tick.navigation.lastFixAt === 2_000, "lastFixAt");
assert(tick.navigation.routeGeneration === 1, "generation SoT");
assert(tick.navigation.headingState === "VALID", "trusted course → VALID");
assert(tick.navigation.heading === 90, "VALID heading is GPS course");
assert(tick.navigation.lastValidHeading === 90, "lastValid set");
assert(tick.navigation.lastValidHeadingAt === 2_000, "lastValidHeadingAt on VALID");
assert(tick.output.heading === 90, "output heading follows commit");

const mirrors = mirrorsFromNavigationState(tick.navigation);
assert(mirrors.routeGeneration === 1, "mirror generation");
assert(mirrors.pose.lat === tick.navigation.displayPosition!.lat, "mirror pose");

{
  const valid = commitHeadingQuality(createNavigationState(), {
    rawHeading: 90,
    speed: NAV_HEADING_TRUST_COURSE_SPEED_MPS,
    nowMs: 1_000_000,
  });
  assert(valid.headingState === "VALID", "valid heading");
  assert(valid.heading === 90, "valid value");
  assert(valid.lastValidHeadingAt === 1_000_000, "VALID updates lastValidHeadingAt");
}

{
  const bad = commitHeadingQuality(
    { heading: 90, lastValidHeading: 90, lastValidHeadingAt: 900_000 },
    { rawHeading: -1, speed: 0, nowMs: 1_000_000 },
  );
  assert(bad.headingState === "UNRELIABLE", "bad → UNRELIABLE");
  assert(bad.heading === 90, "keep last valid");
  assert(bad.lastValidHeadingAt === 900_000, "UNRELIABLE must not update lastValidHeadingAt");
}

{
  const lost = commitHeadingQuality(createNavigationState(), {
    rawHeading: -1,
    speed: 0,
    nowMs: 1,
  });
  assert(lost.headingState === "LOST", "no heading → LOST");
  assert(lost.heading !== 0, "no heading must not become 0");
  assert(lost.heading == null, "no heading stays null");
}

{
  const destLike = commitHeadingQuality(createNavigationState(), {
    rawHeading: 45,
    speed: 0,
    nowMs: 1,
  });
  assert(destLike.headingState === "LOST", "untrusted course without prior valid → LOST");
  assert(destLike.heading == null, "must not commit dest/step bearing");
}

{
  const rec = commitHeadingQuality(
    { heading: 200, lastValidHeading: null, lastValidHeadingAt: null },
    { rawHeading: 12, speed: NAV_HEADING_TRUST_COURSE_SPEED_MPS, nowMs: 50 },
  );
  assert(rec.headingState === "VALID", "LOST → VALID recovery");
  assert(rec.heading === 12, "recovery uses trusted course");
}

{
  const pose = commitNavigationFromLegacyPose(createNavigationState(), {
    lat: 48.74,
    lon: 9.31,
    heading: 77,
    speedMps: 0,
    rawLat: 48.74,
    rawLon: 9.31,
    courseDeg: null,
    nowMs: 3,
  });
  assert(pose.headingState === "LOST", "recenter without trusted course → LOST");
  assert(pose.heading == null, "recenter without dest bearing");
}

{
  const boot = commitHeadingQuality(createNavigationState(), {
    rawHeading: null,
    speed: 0,
    nowMs: 1,
  });
  assert(boot.heading !== 0, "bootstrap without artificial north");
  assert(boot.headingState === "LOST", "bootstrap LOST");
}

{
  const held = commitHeadingQuality(
    { heading: 200, lastValidHeading: 200, lastValidHeadingAt: 5 },
    { rawHeading: -1, speed: 0, nowMs: 9 },
  );
  assert(held.heading === 200, "last valid remains");
  assert(held.headingState === "UNRELIABLE", "still have last valid");
}

{
  const u = commitHeadingQuality(
    { heading: 200, lastValidHeading: 200, lastValidHeadingAt: 5 },
    { rawHeading: 12, speed: 0.4, nowMs: 11 },
  );
  assert(u.heading === 200, "untrusted course not applied");
  assert(u.headingReason === "heading_unreliable", "reason heading_unreliable");
  assert(u.lastValidHeadingAt === 5, "UNRELIABLE does not stamp");
}

console.log("NavigationState.selftest: OK");
