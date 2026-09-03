/**
 * Off-Route / Reroute Selftests (Schritt 5) — Szenarien 1–11.
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
  NAV_OFF_ROUTE_STALL_CONFIRM_MS,
  NAV_OFF_ROUTE_THRESHOLD_M,
  NAV_OFF_ROUTE_UTURN_CONFIRM_MS,
  NAV_ROUTE_PROGRESS_BACKTRACK_M,
  NAV_ROUTE_PROGRESS_MAX_LATERAL_M,
  NAV_REROUTE_COOLDOWN_MS,
  beginReroute,
  canStartReroute,
  completeReroute,
  createOffRouteTrackerState,
  createRerouteEngineState,
  evaluateNavOffRouteSample,
  failReroute,
  measureRestRouteLateralM,
  noteOffRouteSample,
  shouldAcceptRerouteResponse,
} from "./navOffRouteReroute";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function approx(a: number, b: number, tol: number, msg: string): void {
  assert(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected ~${b}`);
}

function confirmOff(
  forwardDistM: number,
  label: string,
  extras?: {
    progressM?: number;
    courseDeg?: number;
    routeBearingDeg?: number;
    speedMps?: number;
    ticks?: Array<{ dtMs: number; forwardDistM?: number; progressM?: number }>;
  },
): void {
  let st = createOffRouteTrackerState();
  let t = 50_000;
  const ticks =
    extras?.ticks ??
    [
      { dtMs: 0 },
      { dtMs: 200 },
    ];
  let confirmed = false;
  let progress = extras?.progressM ?? 100;
  for (const tick of ticks) {
    t += tick.dtMs;
    if (tick.progressM != null) progress = tick.progressM;
    const ev = evaluateNavOffRouteSample({
      state: st,
      nowMs: t,
      forwardDistM: tick.forwardDistM ?? forwardDistM,
      committedProgressM: progress,
      courseDeg: extras?.courseDeg,
      routeBearingDeg: extras?.routeBearingDeg,
      speedMps: extras?.speedMps ?? 8,
      routeGeneration: 1,
      snapshotGeneration: 1,
    });
    st = ev.state;
    if (ev.confirmedOffRoute) confirmed = true;
  }
  assert(confirmed, `${label}: expected confirmedOffRoute`);
}

function assertNotConfirmed(
  label: string,
  ticks: Array<{
    dtMs: number;
    forwardDistM: number;
    courseDeg?: number;
    routeBearingDeg?: number;
    speedMps?: number;
    progressM?: number;
  }>,
): void {
  let st = createOffRouteTrackerState();
  let t = 80_000;
  for (const tick of ticks) {
    t += tick.dtMs;
    const ev = evaluateNavOffRouteSample({
      state: st,
      nowMs: t,
      forwardDistM: tick.forwardDistM,
      committedProgressM: tick.progressM ?? 100,
      courseDeg: tick.courseDeg,
      routeBearingDeg: tick.routeBearingDeg,
      speedMps: tick.speedMps ?? 8,
      routeGeneration: 1,
      snapshotGeneration: 1,
    });
    st = ev.state;
    assert(!ev.confirmedOffRoute, `${label}: unexpected confirm`);
  }
}

// --- Basis ---
const poly = [
  { lat: 48.74, lon: 9.31 },
  { lat: 48.741, lon: 9.31 },
];
assert(distanceToPolylineM(poly, { lat: 48.7405, lon: 9.31 })! < 2, "on segment ~0");
approx(distanceToPolylineM(poly, { lat: 48.7405, lon: 9.3105 }) ?? -1, 37, 8, "side offset ~37m");

const along = remainingAlongPolyline(poly, { lat: 48.7405, lon: 9.31 });
assert(along != null && along.fractionLeft > 0.4 && along.fractionLeft < 0.6, "mid fraction");

let st = createOffRouteTrackerState();
let r = noteOffRouteSample(st, 5, 1000);
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

// L-Route: Nord dann West
const lRoute = [
  { lat: 48.74, lon: 9.31 },
  { lat: 48.741, lon: 9.31 },
  { lat: 48.741, lon: 9.309 },
];

// ===========================================================================
// 1) Normale Fahrt → kein Reroute
// ===========================================================================
{
  assertNotConfirmed("1 on-route", [
    { dtMs: 0, forwardDistM: 3, courseDeg: 0, routeBearingDeg: 0, speedMps: 10 },
    { dtMs: 300, forwardDistM: 4, courseDeg: 0, routeBearingDeg: 0, speedMps: 10 },
    { dtMs: 300, forwardDistM: 2, courseDeg: 5, routeBearingDeg: 0, speedMps: 10 },
    { dtMs: 500, forwardDistM: 5, courseDeg: 0, routeBearingDeg: 0, speedMps: 10 },
  ]);
}

// ===========================================================================
// 2) Bewusst rechts falsch abbiegen
// ===========================================================================
{
  const early = { lat: 48.74055, lon: 9.31 };
  let progress = advanceRouteProgressM(0, lRoute, early, {
    maxLateralForAdvanceM: NAV_ROUTE_PROGRESS_MAX_LATERAL_M,
  });
  const wrongRight = { lat: 48.74055, lon: 9.3104 };
  const fwd = measureRestRouteLateralM(lRoute, wrongRight, progress);
  assert(fwd != null && fwd > NAV_OFF_ROUTE_THRESHOLD_M, `2 right forward ${fwd}`);
  confirmOff(fwd!, "2 right wrong turn", { progressM: progress, courseDeg: 90, routeBearingDeg: 0 });
}

// ===========================================================================
// 3) Bewusst links falsch abbiegen
// ===========================================================================
{
  const at = { lat: 48.7407, lon: 9.31 };
  let progress = advanceRouteProgressM(0, lRoute, at, {
    maxLateralForAdvanceM: NAV_ROUTE_PROGRESS_MAX_LATERAL_M,
  });
  const wrongLeft = { lat: 48.7407, lon: 9.3096 };
  const fwd = measureRestRouteLateralM(lRoute, wrongLeft, progress);
  assert(fwd != null && fwd > NAV_OFF_ROUTE_THRESHOLD_M, `3 left forward ${fwd}`);
  confirmOff(fwd!, "3 left wrong turn", { progressM: progress, courseDeg: 270, routeBearingDeg: 0 });
}

// ===========================================================================
// 4) Parallelstraße mit ähnlichem Heading
// ===========================================================================
{
  const onRoute = { lat: 48.7405, lon: 9.31 };
  let progress = advanceRouteProgressM(0, lRoute, onRoute, {
    maxLateralForAdvanceM: NAV_ROUTE_PROGRESS_MAX_LATERAL_M,
  });
  const parallel = { lat: 48.7407, lon: 9.31035 };
  const fwd = measureRestRouteLateralM(lRoute, parallel, progress);
  assert(fwd != null && fwd > NAV_OFF_ROUTE_THRESHOLD_M, `4 parallel forward ${fwd}`);
  confirmOff(fwd!, "4 parallel side street", {
    progressM: progress,
    courseDeg: 0,
    routeBearingDeg: 0,
    speedMps: 10,
  });

  // Engere Parallel: Stall (Fahren ohne Progress)
  const tightParallel = { lat: 48.7407, lon: 9.31012 };
  const fwdTight = measureRestRouteLateralM(lRoute, tightParallel, progress);
  let stallSt = createOffRouteTrackerState();
  let t = 60_000;
  const frozenProgress = progress;
  let stallConfirmed = false;
  for (const dt of [0, 500, 500, 500, 500, 500, 500]) {
    t += dt;
    const ev = evaluateNavOffRouteSample({
      state: stallSt,
      nowMs: t,
      forwardDistM: fwdTight ?? 10,
      committedProgressM: frozenProgress,
      courseDeg: 0,
      routeBearingDeg: 0,
      speedMps: 8,
      routeGeneration: 1,
      snapshotGeneration: 1,
    });
    stallSt = ev.state;
    if (ev.stallForced || ev.confirmedOffRoute) stallConfirmed = true;
  }
  assert(
    t - 60_000 >= NAV_OFF_ROUTE_STALL_CONFIRM_MS - 100,
    "4 stall window elapsed",
  );
  assert(stallConfirmed, "4 tight parallel stall forces off-route");
}

// ===========================================================================
// 5) 180°-Fehlfahrt — Rest-Route Lateral (nicht Heading allein)
// ===========================================================================
{
  const atJunction = { lat: 48.741, lon: 9.31 };
  let progress = advanceRouteProgressM(0, lRoute, atJunction, {
    maxLateralForAdvanceM: NAV_ROUTE_PROGRESS_MAX_LATERAL_M,
  });
  const backOnPast = { lat: 48.7404, lon: 9.31 };
  const fullDist = distanceToPolylineM(lRoute, backOnPast);
  const forwardDist = measureRestRouteLateralM(lRoute, backOnPast, progress);
  assert(fullDist != null && fullDist < NAV_OFF_ROUTE_THRESHOLD_M, `5 past full ${fullDist}`);
  assert(
    forwardDist != null && forwardDist > NAV_OFF_ROUTE_THRESHOLD_M,
    `5 past forward ${forwardDist}`,
  );
  confirmOff(forwardDist!, "5 180 past-track via rest-route", {
    progressM: progress,
    courseDeg: 180,
    routeBearingDeg: 0,
    speedMps: 8,
  });

  // Heading allein bei kleinem Lateral → KEIN Reroute
  assertNotConfirmed("5 heading-alone no confirm", [
    {
      dtMs: 0,
      forwardDistM: 5,
      courseDeg: 180,
      routeBearingDeg: 0,
      speedMps: 6,
    },
    {
      dtMs: NAV_OFF_ROUTE_UTURN_CONFIRM_MS,
      forwardDistM: 5,
      courseDeg: 180,
      routeBearingDeg: 0,
      speedMps: 6,
    },
    {
      dtMs: 400,
      forwardDistM: 5,
      courseDeg: 180,
      routeBearingDeg: 0,
      speedMps: 6,
    },
  ]);
}

// ===========================================================================
// 6) Kreisverkehr falsche Ausfahrt
// ===========================================================================
{
  const roundabout = [
    { lat: 48.75, lon: 9.32 },
    { lat: 48.7504, lon: 9.32 },
    { lat: 48.7504, lon: 9.3205 },
  ];
  const atNorth = { lat: 48.7504, lon: 9.32 };
  let progress = advanceRouteProgressM(0, roundabout, atNorth, {
    maxLateralForAdvanceM: NAV_ROUTE_PROGRESS_MAX_LATERAL_M,
  });
  const wrongExit = { lat: 48.7508, lon: 9.32 };
  const fwd = measureRestRouteLateralM(roundabout, wrongExit, progress);
  assert(fwd != null && fwd > NAV_OFF_ROUTE_THRESHOLD_M, `6 roundabout forward ${fwd}`);
  confirmOff(fwd!, "6 roundabout wrong exit", {
    progressM: progress,
    courseDeg: 0,
    routeBearingDeg: 90,
    speedMps: 7,
  });
}

// ===========================================================================
// 7) Kurze GPS-Abweichung → kein unnötiges Reroute
// ===========================================================================
{
  assertNotConfirmed("7 gps glitch", [
    { dtMs: 0, forwardDistM: 40 },
    { dtMs: 100, forwardDistM: 3 }, // zurück on-route vor Confirm
    { dtMs: 200, forwardDistM: 4 },
  ]);
}

// ===========================================================================
// 8) GPS-Sprung → kein Reroute-Spam (ein Request + Cooldown)
// ===========================================================================
{
  let rst = createRerouteEngineState();
  const b1 = beginReroute(rst, { nowMs: 100_000, currentBoundGeneration: 1 });
  assert(b1 != null, "8 begin");
  rst = b1!.state;
  const b2 = beginReroute(rst, { nowMs: 100_100, currentBoundGeneration: 1 });
  assert(b2 == null, "8 second begin blocked while in flight");
  rst = completeReroute(rst, b1!.requestId, 100_200);
  const b3 = beginReroute(rst, {
    nowMs: 100_200 + 100,
    currentBoundGeneration: 2,
  });
  assert(b3 == null, "8 cooldown blocks spam");
  const b4 = beginReroute(rst, {
    nowMs: 100_200 + NAV_REROUTE_COOLDOWN_MS,
    currentBoundGeneration: 2,
  });
  assert(b4 != null, "8 after cooldown ok");
}

// ===========================================================================
// 9) Reroute dauert → alte Guidance bleibt deaktiviert (stale generation / in flight)
// ===========================================================================
{
  const ev = evaluateNavOffRouteSample({
    state: createOffRouteTrackerState(),
    nowMs: 200_000,
    forwardDistM: 50,
    committedProgressM: 100,
    routeGeneration: 3,
    snapshotGeneration: 2, // stale snapshot
  });
  assert(!ev.confirmedOffRoute, "9 no confirm on stale generation");
}

// ===========================================================================
// 10) Verspätete alte Route-Response verwerfen
// ===========================================================================
{
  let rst = createRerouteEngineState();
  const b1 = beginReroute(rst, { nowMs: 300_000, currentBoundGeneration: 4 });
  assert(b1 != null, "10 begin");
  rst = b1!.state;
  rst = failReroute(rst, b1!.requestId, 300_500);
  const b2 = beginReroute(rst, {
    nowMs: 300_500 + NAV_REROUTE_COOLDOWN_MS,
    currentBoundGeneration: 5,
  });
  assert(b2 != null, "10 begin2");
  rst = b2!.state;
  assert(!shouldAcceptRerouteResponse(rst, b1!.requestId), "10 old response rejected");
  assert(shouldAcceptRerouteResponse(rst, b2!.requestId), "10 new accepted");
  rst = completeReroute(rst, b2!.requestId, Date.now());
}

// ===========================================================================
// 11) Neue Route → Progress/Maneuver auf neue Generation (Rest-Route Lateral ≠ Snap)
// ===========================================================================
{
  const atJunction = { lat: 48.741, lon: 9.31 };
  let progress = advanceRouteProgressM(0, lRoute, atJunction, {
    maxLateralForAdvanceM: NAV_ROUTE_PROGRESS_MAX_LATERAL_M,
  });
  const filteredBeside = { lat: 48.741, lon: 9.3104 };
  const snappedOnRoute = { lat: 48.741, lon: 9.31 };
  const fromSnap = distanceToForwardPolylineM(
    lRoute,
    snappedOnRoute,
    Math.max(0, progress - NAV_ROUTE_PROGRESS_BACKTRACK_M),
  );
  const fromFiltered = measureRestRouteLateralM(lRoute, filteredBeside, progress);
  assert(fromSnap != null && fromSnap < NAV_OFF_ROUTE_THRESHOLD_M, `11 snap ~0 got ${fromSnap}`);
  assert(
    fromFiltered != null && fromFiltered > NAV_OFF_ROUTE_THRESHOLD_M,
    `11 filtered lateral ${fromFiltered}`,
  );
}

assert(progressAlongPolylineAt(lRoute, { lat: 48.741, lon: 9.31 }) != null, "progressAlong ok");

console.log("navOffRouteReroute.selftest: OK (scenarios 1–11 + baseline)");
