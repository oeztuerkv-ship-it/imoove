/**
 * Smoke: RouteProgressEngine — kanonischer Progress.
 *   npx tsx artifacts/mobile/utils/navEngine/RouteProgressEngine.selftest.ts
 *
 * Szenarien: a normale Fahrt, b mehrere Fixes, c abgefahrene Spur,
 * d Falschabbiegen, e Reroute Generation, f alte Generation liefert keinen Progress.
 */
import {
  distanceAlongRouteFromProgressM,
  initCommittedProgressForRoute,
  remainingFromCommittedProgress,
  splitPolylineAtCommittedProgressM,
  tickRouteProgress,
} from "./RouteProgressEngine";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

/** ~111 m pro 0.001° lat */
const poly = [
  { lat: 48.74, lon: 9.31 },
  { lat: 48.741, lon: 9.31 }, // ~111 m
  { lat: 48.742, lon: 9.31 }, // ~222 m
  { lat: 48.743, lon: 9.31 }, // ~333 m
];

// (a) normale Fahrt auf Route
const p0 = initCommittedProgressForRoute(poly, { lat: 48.74, lon: 9.31 });
assert(p0 < 15, `start progress ~0 got ${p0}`);

// (b) Fortschritt nach mehreren GPS-Punkten
let committed = p0;
let t = tickRouteProgress({
  polyline: poly,
  at: { lat: 48.7405, lon: 9.31 },
  committedProgressM: committed,
  routeGeneration: 1,
  snapshotGeneration: 1,
  authoritativeDistM: 400,
  authoritativeEtaMin: 4,
  allowAdvance: true,
});
committed = t.committedProgressM;
assert(committed > 40 && committed < 80, `mid progress ${committed}`);
assert(t.remainingDistM > 0 && t.remainingDistM < 400, `remaining ${t.remainingDistM}`);
assert(t.fractionLeft < 1 && t.fractionLeft > 0.5, `fraction ${t.fractionLeft}`);

t = tickRouteProgress({
  polyline: poly,
  at: { lat: 48.7415, lon: 9.31 },
  committedProgressM: committed,
  routeGeneration: 1,
  snapshotGeneration: 1,
  authoritativeDistM: 400,
  authoritativeEtaMin: 4,
  allowAdvance: true,
});
assert(t.committedProgressM > committed, "progress advances");
committed = t.committedProgressM;

// Manöver ~300 m vor Ende: Distanz aus Progress
const turnAt = { lat: 48.7427, lon: 9.31 };
const distTurn = distanceAlongRouteFromProgressM(poly, committed, turnAt);
assert(distTurn != null && distTurn > 50, `dist to turn ${distTurn}`);

// (c) bereits abgefahrene Route — nearest auf alter Spur darf Progress nicht zurücksetzen
const past = { lat: 48.7402, lon: 9.31 };
const beforeBack = committed;
t = tickRouteProgress({
  polyline: poly,
  at: past,
  committedProgressM: committed,
  routeGeneration: 1,
  snapshotGeneration: 1,
  authoritativeDistM: 400,
  authoritativeEtaMin: 4,
  allowAdvance: true,
});
assert(t.committedProgressM >= beforeBack - 0.5, "no backtrack on past track");
const remCommitted = remainingFromCommittedProgress(poly, t.committedProgressM);
assert(!!remCommitted && remCommitted.remainingM < remCommitted.totalM * 0.7, "remaining from committed not full route");

// (d) Falschabbiegen — lateral weit: Progress friert (kein Advance), Remaining bleibt committed-basiert
const wrong = { lat: 48.7415, lon: 9.312 };
const atWrong = t.committedProgressM;
t = tickRouteProgress({
  polyline: poly,
  at: wrong,
  committedProgressM: atWrong,
  routeGeneration: 1,
  snapshotGeneration: 1,
  authoritativeDistM: 400,
  authoritativeEtaMin: 4,
  allowAdvance: true,
});
assert(t.committedProgressM === atWrong, "no advance when far lateral");
assert(t.forwardDistM != null && t.forwardDistM > 20, `forwardDist wrong turn ${t.forwardDistM}`);
assert(
  Math.abs(t.remainingDistM - Math.round(400 * (remainingFromCommittedProgress(poly, atWrong)?.fractionLeft ?? 0))) <
    2,
  "remaining still from committed during wrong turn",
);

// (e) Reroute auf neue Generation — Progress neu von Pose
const newPoly = [
  { lat: 48.7415, lon: 9.312 },
  { lat: 48.7415, lon: 9.313 },
  { lat: 48.7415, lon: 9.314 },
];
const newP = initCommittedProgressForRoute(newPoly, { lat: 48.7415, lon: 9.312 });
assert(newP < 20, `reroute init ${newP}`);
t = tickRouteProgress({
  polyline: newPoly,
  at: { lat: 48.7415, lon: 9.3125 },
  committedProgressM: newP,
  routeGeneration: 2,
  snapshotGeneration: 2,
  authoritativeDistM: 200,
  authoritativeEtaMin: 2,
  allowAdvance: true,
});
assert(t.committedProgressM >= newP, "gen2 advances");
assert(!t.staleGeneration, "gen2 not stale");

// (f) alte Generation liefert keinen Progress mehr
const stale = tickRouteProgress({
  polyline: poly,
  at: { lat: 48.742, lon: 9.31 },
  committedProgressM: 200,
  routeGeneration: 2,
  snapshotGeneration: 1,
  authoritativeDistM: 400,
  authoritativeEtaMin: 4,
  allowAdvance: true,
});
assert(stale.staleGeneration, "stale generation flagged");
assert(stale.remainingDistM === 0, "stale → no remaining from old route");
assert(stale.committedProgressM === 200, "stale does not advance on old poly");

// Glow split from committed
const split = splitPolylineAtCommittedProgressM(poly, 120);
assert(!!split, "split ok");
assert(split!.traveled.length >= 2 || split!.remaining.length >= 2, "split has geometry");

console.log("RouteProgressEngine.selftest: ok");
