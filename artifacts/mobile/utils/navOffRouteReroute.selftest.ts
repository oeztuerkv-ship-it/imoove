/**
 * Smoke: Polyline-Distanz + Off-Route-Tracker + Falschabbiegen-Repro.
 *   npx tsx artifacts/mobile/utils/navOffRouteReroute.selftest.ts
 */
import {
  advanceRouteProgressM,
  distanceToForwardPolylineM,
  distanceToPolylineM,
  progressAlongPolylineAt,
  remainingAlongPolyline,
} from "./routeRemainingAlongPolyline";
import {
  NAV_OFF_ROUTE_CONFIRM_FIXES,
  NAV_OFF_ROUTE_CONFIRM_MS,
  NAV_OFF_ROUTE_THRESHOLD_M,
  NAV_ROUTE_PROGRESS_BACKTRACK_M,
  NAV_REROUTE_COOLDOWN_MS,
  canStartReroute,
  createOffRouteTrackerState,
  effectiveOffRouteDistanceM,
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

// ---------------------------------------------------------------------------
// Repro: bewusst falsch abbiegen (L-Route: Nord, dann West)
// Fahrer erreicht Kreuzung (Progress committed), fährt wieder zurück auf die
// bereits abgefahrene Nord-Süd-Spur (oder bleibt daran) statt nach Westen.
// Full-polyline-Distanz ≈ 0 → früher KEIN Reroute.
// Forward-only (ab Progress) → großer Abstand zur West-Restroute → Reroute.
// ---------------------------------------------------------------------------
const lRoute = [
  { lat: 48.74, lon: 9.31 }, // start
  { lat: 48.741, lon: 9.31 }, // junction (~111m N)
  { lat: 48.741, lon: 9.309 }, // west arm (~74m W)
];

const atJunction = { lat: 48.741, lon: 9.31 };
let progress = 0;
progress = advanceRouteProgressM(progress, lRoute, atJunction);
assert(progress > 100, `progress at junction got ${progress}`);

// Zurück auf abgefahrene Spur (südlich der Kreuzung) — klassisches „nah an alter Linie“
const backOnPast = { lat: 48.7404, lon: 9.31 };
const fullDist = distanceToPolylineM(lRoute, backOnPast);
const fromProg = Math.max(0, progress - NAV_ROUTE_PROGRESS_BACKTRACK_M);
const forwardDist = distanceToForwardPolylineM(lRoute, backOnPast, fromProg);

assert(
  fullDist != null && fullDist < NAV_OFF_ROUTE_THRESHOLD_M,
  `BUG-Repro: full dist still "on route" (got ${fullDist})`,
);
assert(
  forwardDist != null && forwardDist > NAV_OFF_ROUTE_THRESHOLD_M,
  `forward must be off-route on past track (got ${forwardDist}, full was ${fullDist})`,
);

// Simulate confirm pipeline like navigation.tsx
st = createOffRouteTrackerState();
const t0 = 10_000;
r = noteOffRouteSample(st, forwardDist, t0);
st = r.state;
r = noteOffRouteSample(st, forwardDist, t0 + 200);
assert(r.confirmedOffRoute, "missed-turn forward dist confirms reroute within 2 fixes");

// Zweites Repro: weiter geradeaus nach Norden (kein West-Abbiegen)
const wrongNorth = { lat: 48.7416, lon: 9.31 };
const forwardNorth = distanceToForwardPolylineM(lRoute, wrongNorth, fromProg);
assert(
  forwardNorth != null && forwardNorth > NAV_OFF_ROUTE_THRESHOLD_M,
  `continue-straight forward off-route (got ${forwardNorth})`,
);

// Heading-Mismatch erzwingt Off-Route auch bei kleinem Forward-Abstand (Parallelstraße)
st = createOffRouteTrackerState();
let eff = effectiveOffRouteDistanceM({
  forwardDistM: 8,
  courseDeg: 0, // north
  routeBearingDeg: 270, // route wants west
  speedMps: 8,
  nowMs: 20_000,
  state: st,
});
assert(!eff.headingForced, "heading not forced yet");
st = eff.state;
eff = effectiveOffRouteDistanceM({
  forwardDistM: 8,
  courseDeg: 0,
  routeBearingDeg: 270,
  speedMps: 8,
  nowMs: 20_000 + 1300,
  state: st,
});
assert(eff.headingForced, "heading forced after confirm window");
assert(eff.distanceM != null && eff.distanceM > NAV_OFF_ROUTE_THRESHOLD_M, "heading raises dist");

assert(progressAlongPolylineAt(lRoute, atJunction) != null, "progressAlong ok");

console.log("navOffRouteReroute.selftest: OK");
console.log(
  `  missed-turn repro: fullDist=${fullDist?.toFixed(1)}m forwardDist=${forwardDist?.toFixed(1)}m → reroute`,
);
