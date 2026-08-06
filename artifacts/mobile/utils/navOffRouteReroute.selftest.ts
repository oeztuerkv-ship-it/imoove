/**
 * Smoke: Polyline-Distanz + Off-Route-Tracker.
 *   npx tsx artifacts/mobile/utils/navOffRouteReroute.selftest.ts
 */
import { distanceToPolylineM, remainingAlongPolyline } from "./routeRemainingAlongPolyline";
import {
  NAV_OFF_ROUTE_CONFIRM_FIXES,
  NAV_OFF_ROUTE_CONFIRM_MS,
  NAV_OFF_ROUTE_THRESHOLD_M,
  NAV_REROUTE_COOLDOWN_MS,
  canStartReroute,
  createOffRouteTrackerState,
  noteOffRouteSample,
} from "./navOffRouteReroute";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function approx(a: number, b: number, tol: number, msg: string): void {
  assert(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected ~${b}`);
}

// North–south segment ~111m per 0.001° lat
const poly = [
  { lat: 48.74, lon: 9.31 },
  { lat: 48.741, lon: 9.31 },
];

assert(distanceToPolylineM(poly, { lat: 48.7405, lon: 9.31 })! < 2, "on segment ~0");
approx(distanceToPolylineM(poly, { lat: 48.7405, lon: 9.3105 }) ?? -1, 37, 8, "side offset ~37m");
assert(distanceToPolylineM([{ lat: 48.74, lon: 9.31 }], { lat: 48.74, lon: 9.31 }) == null, "need 2 pts");

const along = remainingAlongPolyline(poly, { lat: 48.7405, lon: 9.31 });
assert(along != null && along.fractionLeft > 0.4 && along.fractionLeft < 0.6, "mid fraction");

let st = createOffRouteTrackerState();
let r = noteOffRouteSample(st, 10, 1000);
assert(!r.confirmedOffRoute && r.state.consecutiveOffFixes === 0, "on route reset");

st = r.state;
r = noteOffRouteSample(st, NAV_OFF_ROUTE_THRESHOLD_M + 5, 2000);
assert(!r.confirmedOffRoute && r.state.consecutiveOffFixes === 1, "first off");
st = r.state;
r = noteOffRouteSample(st, NAV_OFF_ROUTE_THRESHOLD_M + 5, 2100);
assert(r.confirmedOffRoute && r.state.consecutiveOffFixes >= NAV_OFF_ROUTE_CONFIRM_FIXES, "second confirms");

st = createOffRouteTrackerState();
r = noteOffRouteSample(st, 80, 5000);
st = r.state;
r = noteOffRouteSample(st, 80, 5000 + NAV_OFF_ROUTE_CONFIRM_MS);
assert(r.confirmedOffRoute, "time confirms");

r = noteOffRouteSample(r.state, 5, 9000);
assert(!r.confirmedOffRoute && r.state.consecutiveOffFixes === 0, "back on route");

assert(canStartReroute({ inFlight: false, lastRerouteAtMs: null, nowMs: 0 }), "first ok");
assert(!canStartReroute({ inFlight: true, lastRerouteAtMs: null, nowMs: 0 }), "in flight block");
assert(
  !canStartReroute({
    inFlight: false,
    lastRerouteAtMs: 1000,
    nowMs: 1000 + NAV_REROUTE_COOLDOWN_MS - 1,
  }),
  "cooldown block",
);
assert(
  canStartReroute({
    inFlight: false,
    lastRerouteAtMs: 1000,
    nowMs: 1000 + NAV_REROUTE_COOLDOWN_MS,
  }),
  "cooldown ok",
);

console.log("navOffRouteReroute.selftest: OK");
