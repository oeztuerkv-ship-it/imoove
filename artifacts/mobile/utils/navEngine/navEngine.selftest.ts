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
};

let state = createNavEngineState();
state = resetNavEngineForRoute(state, lRoute, { lat: 48.74, lon: 9.31 });
assert(state.heading.heading != null, "start heading from route");

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
  assert(r.output.cameraPitch === 45, "pitch 45");
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
t += 500;
r = tickNavEngine(
  state,
  { lat: 48.74035, lon: 9.31, speedMps: 8, courseDeg: 180, nowMs: t },
  lRoute,
);
state = r.state;
t += 500;
r = tickNavEngine(
  state,
  { lat: 48.7403, lon: 9.31, speedMps: 8, courseDeg: 180, nowMs: t },
  lRoute,
);
assert(r.output.confirmedOffRoute, "missed turn → offRoute");
assert(
  (r.output.distToManeuverM === 0 && r.output.guidanceStale === false) ||
    r.output.confirmedOffRoute,
  "off confirmed",
);

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
assert(r.output.diag != null, "diag present");

assert(NAV_OFF_ROUTE_THRESHOLD_M === 14, "threshold wired");

console.log("navEngine.selftest: OK");
