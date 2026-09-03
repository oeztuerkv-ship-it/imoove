/**
 * Smoke: NavigationEngine Tick + Missed-Turn → offRoute.
 *   npx tsx artifacts/mobile/utils/navEngine/navEngine.selftest.ts
 */
import {
  createNavEngineState,
  resetNavEngineForRoute,
  setNavEngineRerouteInFlight,
  tickNavEngine,
} from "./NavigationEngine";
import type { NavRouteSnapshot } from "./types";
import { NAV_OFF_ROUTE_THRESHOLD_M } from "../navOffRouteReroute";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const lRoute: NavRouteSnapshot = {
  polyline: [
    { lat: 48.74, lon: 9.31 },
    { lat: 48.741, lon: 9.31 },
    { lat: 48.741, lon: 9.309 },
  ],
  steps: [
    {
      instruction: "Weiterfahren",
      maneuver: "Weiterfahren",
      roadName: "Teststraße",
      distanceM: 100,
      lat: 48.7405,
      lon: 9.31,
    },
    {
      instruction: "Links abbiegen",
      maneuver: "Links abbiegen",
      roadName: "Weststraße",
      distanceM: 70,
      lat: 48.741,
      lon: 9.3095,
    },
  ],
  authoritativeDistM: 185,
  authoritativeEtaMin: 3,
  generation: 1,
};

let state = createNavEngineState();
state = resetNavEngineForRoute(state, lRoute, { lat: 48.74, lon: 9.31 });
assert(state.heading.heading == null, "start heading not from route");

// Drive to junction
let t = 1_000;
for (let i = 0; i < 5; i++) {
  t += 1000;
  const lat = 48.74 + 0.0002 * (i + 1);
  const r = tickNavEngine(
    state,
    { lat, lon: 9.31, speedMps: 8, courseDeg: 0, nowMs: t },
    lRoute,
  );
  state = r.state;
  assert(!r.output.guidanceStale, "not stale on route");
  assert(r.output.maneuver != null, "maneuver present");
  assert(r.output.cameraPitch === 62, "pitch 62");
}

// At junction then back on past track (missed turn)
state = resetNavEngineForRoute(state, lRoute, { lat: 48.741, lon: 9.31 });
t += 1000;
let r = tickNavEngine(
  state,
  { lat: 48.741, lon: 9.31, speedMps: 8, courseDeg: 0, nowMs: t },
  lRoute,
);
state = r.state;
assert(state.routeProgressM > 80, `progress ${state.routeProgressM}`);

t += 1000;
r = tickNavEngine(
  state,
  { lat: 48.7404, lon: 9.31, speedMps: 8, courseDeg: 180, nowMs: t },
  lRoute,
);
state = r.state;
t += 300;
r = tickNavEngine(
  state,
  { lat: 48.74035, lon: 9.31, speedMps: 8, courseDeg: 180, nowMs: t },
  lRoute,
);
assert(r.output.confirmedOffRoute, "missed turn → offRoute");
assert(r.output.guidanceStale, "5 confirmedOffRoute → guidance immediately stale");
assert(r.output.maneuver == null, "5 no maneuver when off-route confirmed");
assert(r.output.distToManeuverM === 0, "5 no stale turn meters");

// Stale guidance while reroute in flight
state = setNavEngineRerouteInFlight(r.state, true);
t += 500;
r = tickNavEngine(
  state,
  { lat: 48.7403, lon: 9.31, speedMps: 5, courseDeg: 180, nowMs: t },
  lRoute,
);
assert(r.output.guidanceStale, "stale during reroute");
assert(r.output.maneuver == null, "no stale maneuver");
assert(r.output.distToManeuverM === 0, "no stale distance");
// Schritt 2: während Reroute kein Snap auf alte Polyline → display === filtered
assert(
  r.output.display.lat === r.output.filtered.lat &&
    r.output.display.lon === r.output.filtered.lon,
  "no snap to old route while rerouteInFlight",
);
assert(!r.output.snapped, "not snapped during reroute");

// Stale route generation: older snapshot must not drive match after reset to gen 2
const routeGen2: NavRouteSnapshot = { ...lRoute, generation: 2 };
state = resetNavEngineForRoute(r.state, routeGen2, { lat: 48.7403, lon: 9.31 });
assert(state.routeGeneration === 2, "bound generation 2");
t += 500;
const staleSnap: NavRouteSnapshot = { ...lRoute, generation: 1 };
r = tickNavEngine(
  state,
  { lat: 48.7405, lon: 9.3102, speedMps: 5, courseDeg: 0, nowMs: t },
  staleSnap,
);
assert(
  r.output.display.lat === r.output.filtered.lat &&
    r.output.display.lon === r.output.filtered.lon,
  "stale generation → no snap",
);
assert(r.navigation === r.state.runtime, "P1 navigation is engine.runtime");
assert(r.navigation.gpsState === "ACTIVE", "P1 gpsState ACTIVE after tick");

assert(NAV_OFF_ROUTE_THRESHOLD_M === 12, "threshold wired");

console.log("navEngine.selftest: OK");
