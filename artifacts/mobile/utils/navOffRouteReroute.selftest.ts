/**
 * Smoke: Off-Route / Reroute inkl. 6 Fahrer-Szenarien.
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
  canStartReroute,
  createOffRouteTrackerState,
  evaluateNavOffRouteSample,
  noteOffRouteSample,
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
    ticks?: Array<{ dtMs: number; forwardDistM?: number }>;
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
  for (const tick of ticks) {
    t += tick.dtMs;
    const ev = evaluateNavOffRouteSample({
      state: st,
      nowMs: t,
      forwardDistM: tick.forwardDistM ?? forwardDistM,
      committedProgressM: extras?.progressM ?? 100,
      courseDeg: extras?.courseDeg,
      routeBearingDeg: extras?.routeBearingDeg,
      speedMps: extras?.speedMps ?? 8,
    });
    st = ev.state;
    if (ev.confirmedOffRoute) confirmed = true;
  }
  assert(confirmed, `${label}: expected confirmedOffRoute`);
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
assert(
  canStartReroute({
    inFlight: false,
    lastRerouteAtMs: 1000,
    nowMs: 1000 + NAV_REROUTE_COOLDOWN_MS,
  }),
  "cooldown ok",
);

// L-Route: Nord dann West (~111m + ~74m)
const lRoute = [
  { lat: 48.74, lon: 9.31 },
  { lat: 48.741, lon: 9.31 },
  { lat: 48.741, lon: 9.309 },
];

// ===========================================================================
// 1) Früh falsch abbiegen (30–50 m vor der Abzweigung)
// ===========================================================================
{
  // Progress ~60 m (noch ~50 m bis Kreuzung), dann seitlich weg
  const early = { lat: 48.74055, lon: 9.31 };
  let progress = advanceRouteProgressM(0, lRoute, early, {
    maxLateralForAdvanceM: NAV_ROUTE_PROGRESS_MAX_LATERAL_M,
  });
  assert(progress > 40 && progress < 90, `1 early progress got ${progress}`);
  const wrongEarly = { lat: 48.74055, lon: 9.3104 }; // ~30 m Ost
  const fromProg = Math.max(0, progress - NAV_ROUTE_PROGRESS_BACKTRACK_M);
  const fwd = distanceToForwardPolylineM(lRoute, wrongEarly, fromProg);
  assert(fwd != null && fwd > NAV_OFF_ROUTE_THRESHOLD_M, `1 early forward ${fwd}`);
  confirmOff(fwd!, "1 early wrong turn");
}

// ===========================================================================
// 2) Parallel auf Nebenstraße (gleicher Kurs ~Nord)
// ===========================================================================
{
  const onRoute = { lat: 48.7405, lon: 9.31 };
  let progress = advanceRouteProgressM(0, lRoute, onRoute, {
    maxLateralForAdvanceM: NAV_ROUTE_PROGRESS_MAX_LATERAL_M,
  });
  // ~25 m parallel östlich, gleicher Kurs
  const parallel = { lat: 48.7407, lon: 9.31035 };
  const fromProg = Math.max(0, progress - NAV_ROUTE_PROGRESS_BACKTRACK_M);
  const fwd = distanceToForwardPolylineM(lRoute, parallel, fromProg);
  assert(fwd != null && fwd > NAV_OFF_ROUTE_THRESHOLD_M, `2 parallel forward ${fwd}`);
  // Gleicher Kurs → kein Heading-Force nötig, Lateral reicht
  confirmOff(fwd!, "2 parallel side street", {
    progressM: progress,
    courseDeg: 0,
    routeBearingDeg: 0,
    speedMps: 10,
  });

  // Engere Parallel (~10 m): Fortschritt stockt → Stall erzwingt Off-Route
  const tightParallel = { lat: 48.7407, lon: 9.31012 };
  const fwdTight = distanceToForwardPolylineM(lRoute, tightParallel, fromProg);
  // Progress darf bei >20 m Lateral nicht stark steigen; Stall-Pfad:
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
      committedProgressM: frozenProgress, // kein Fortschritt trotz Fahrt
      courseDeg: 0,
      routeBearingDeg: 0,
      speedMps: 8,
    });
    stallSt = ev.state;
    if (ev.stallForced || ev.confirmedOffRoute) stallConfirmed = true;
  }
  assert(
    t - 60_000 >= NAV_OFF_ROUTE_STALL_CONFIRM_MS - 100,
    "2 stall window elapsed",
  );
  assert(stallConfirmed, "2 tight parallel stall forces off-route");
}

// ===========================================================================
// 3) 180°-Wende (mit Lateral — Heading allein nahe Route reicht nicht)
// ===========================================================================
{
  confirmOff(8, "3 u-turn heading+lateral", {
    courseDeg: 180,
    routeBearingDeg: 0,
    speedMps: 6,
    ticks: [
      { dtMs: 0 },
      { dtMs: NAV_OFF_ROUTE_UTURN_CONFIRM_MS },
      { dtMs: 200 },
      { dtMs: 200 },
    ],
  });
}

// ===========================================================================
// Regression: Kreuzung/Kurve — Kurs wackelt, Position bleibt nah an Route
// ===========================================================================
{
  let st = createOffRouteTrackerState();
  let t = 80_000;
  let confirmed = false;
  let headingForced = false;
  for (const dt of [0, 300, 300, 300, 300, 300, 300]) {
    t += dt;
    const ev = evaluateNavOffRouteSample({
      state: st,
      nowMs: t,
      forwardDistM: 3,
      committedProgressM: 120 + (t - 80_000) * 0.008,
      courseDeg: 55,
      routeBearingDeg: 0,
      speedMps: 8,
    });
    st = ev.state;
    if (ev.headingForced) headingForced = true;
    if (ev.confirmedOffRoute) confirmed = true;
  }
  assert(!headingForced, "intersection: heading must not force while lateral 3m");
  assert(!confirmed, "intersection: must not confirm off-route / reroute");
}

// ===========================================================================
// 4) Kreisverkehr — falsche Ausfahrt (Rest-Route geht Ost, Fahrer Nord raus)
// ===========================================================================
{
  // Vereinfachtes „Kreis“-Stück: Nord → Ost (Soll-Ausfahrt)
  const roundabout = [
    { lat: 48.75, lon: 9.32 },
    { lat: 48.7504, lon: 9.32 }, // Nord am Kreis
    { lat: 48.7504, lon: 9.3205 }, // Ost-Ausfahrt Soll
  ];
  const atNorth = { lat: 48.7504, lon: 9.32 };
  let progress = advanceRouteProgressM(0, roundabout, atNorth, {
    maxLateralForAdvanceM: NAV_ROUTE_PROGRESS_MAX_LATERAL_M,
  });
  const wrongExit = { lat: 48.7508, lon: 9.32 }; // weiter Nord statt Ost
  const fromProg = Math.max(0, progress - NAV_ROUTE_PROGRESS_BACKTRACK_M);
  const fwd = distanceToForwardPolylineM(roundabout, wrongExit, fromProg);
  assert(fwd != null && fwd > NAV_OFF_ROUTE_THRESHOLD_M, `4 roundabout forward ${fwd}`);
  confirmOff(fwd!, "4 roundabout wrong exit", {
    progressM: progress,
    courseDeg: 0,
    routeBearingDeg: 90,
    speedMps: 7,
  });
}

// ===========================================================================
// 5) Autobahnausfahrt verpasst (Hauptfahrbahn weiter, Rest = Ausfahrt)
// ===========================================================================
{
  // Highway Nord, Ausfahrt biegt Ost ab
  const highway = [
    { lat: 48.76, lon: 9.33 },
    { lat: 48.761, lon: 9.33 }, // Ausfahrt-Beginn
    { lat: 48.761, lon: 9.3312 }, // Ramp Ost
  ];
  const atExit = { lat: 48.761, lon: 9.33 };
  let progress = advanceRouteProgressM(0, highway, atExit, {
    maxLateralForAdvanceM: NAV_ROUTE_PROGRESS_MAX_LATERAL_M,
  });
  assert(progress > 90, `5 exit progress ${progress}`);
  // Weiter auf Hauptfahrbahn nach Norden
  const missed = { lat: 48.7615, lon: 9.33 };
  const fromProg = Math.max(0, progress - NAV_ROUTE_PROGRESS_BACKTRACK_M);
  const fwd = distanceToForwardPolylineM(highway, missed, fromProg);
  assert(fwd != null && fwd > NAV_OFF_ROUTE_THRESHOLD_M, `5 missed exit forward ${fwd}`);
  confirmOff(fwd!, "5 missed highway exit", {
    progressM: progress,
    courseDeg: 0,
    routeBearingDeg: 90,
    speedMps: 25,
  });
}

// ===========================================================================
// 6) Kurz halten, dann andere Richtung
// ===========================================================================
{
  // Stehend: kein Heading-Force / kein Stall
  let holdSt = createOffRouteTrackerState();
  let ev = evaluateNavOffRouteSample({
    state: holdSt,
    nowMs: 70_000,
    forwardDistM: 4,
    committedProgressM: 80,
    courseDeg: 90,
    routeBearingDeg: 0,
    speedMps: 0,
  });
  assert(!ev.headingForced && !ev.stallForced && !ev.confirmedOffRoute, "6 hold still ok");
  holdSt = ev.state;

  // Anfahren in falsche Richtung — braucht Lateral (nicht nur Kurs nahe Route)
  confirmOff(8, "6 after stop wrong direction", {
    progressM: 80,
    courseDeg: 180,
    routeBearingDeg: 0,
    speedMps: 5,
    ticks: [
      { dtMs: 0 },
      { dtMs: NAV_OFF_ROUTE_UTURN_CONFIRM_MS },
      { dtMs: 200 },
      { dtMs: 200 },
    ],
  });
}

// Klassiker: zurück auf abgefahrene Spur
{
  const atJunction = { lat: 48.741, lon: 9.31 };
  let progress = advanceRouteProgressM(0, lRoute, atJunction, {
    maxLateralForAdvanceM: NAV_ROUTE_PROGRESS_MAX_LATERAL_M,
  });
  const backOnPast = { lat: 48.7404, lon: 9.31 };
  const fullDist = distanceToPolylineM(lRoute, backOnPast);
  const fromProg = Math.max(0, progress - NAV_ROUTE_PROGRESS_BACKTRACK_M);
  const forwardDist = distanceToForwardPolylineM(lRoute, backOnPast, fromProg);
  assert(fullDist != null && fullDist < NAV_OFF_ROUTE_THRESHOLD_M, `past full ${fullDist}`);
  assert(
    forwardDist != null && forwardDist > NAV_OFF_ROUTE_THRESHOLD_M,
    `past forward ${forwardDist}`,
  );
  confirmOff(forwardDist!, "past-track full vs forward");
  console.log(
    `  past-track repro: fullDist=${fullDist?.toFixed(1)}m forwardDist=${forwardDist?.toFixed(1)}m`,
  );
}

assert(progressAlongPolylineAt(lRoute, { lat: 48.741, lon: 9.31 }) != null, "progressAlong ok");

console.log("navOffRouteReroute.selftest: OK (6 scenarios + baseline)");
