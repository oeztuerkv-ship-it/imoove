/**
 * Smoke: progress-locked snap (kein RN).
 *   npx tsx artifacts/mobile/utils/routeRemainingAlongPolyline.selftest.ts
 */
import {
  advanceRouteProgressM,
  nearestOnPolylineNearProgress,
  pointAlongPolylineAtProgressM,
  snapLatLonToPolyline,
  snapLatLonToPolylineNearProgress,
} from "./routeRemainingAlongPolyline";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

/**
 * Hin- und Rückweg (Parallelspur) — klassischer Map-Match-Fehler:
 * global nearest springt auf die Rückspur; progress-Fenster hält die Hinfahrt.
 */
const poly = [
  { lat: 48.0, lon: 9.0 },
  { lat: 48.0, lon: 9.003 }, // ~222 m Ost
  { lat: 48.0002, lon: 9.003 }, // kurzer Versatz Nord
  { lat: 48.0002, lon: 9.0 }, // ~222 m West (Parallel)
];

const onOutbound = { lat: 48.0, lon: 9.0015 };
const progressMid = advanceRouteProgressM(0, poly, onOutbound, { maxLateralForAdvanceM: 40 });
assert(progressMid > 80 && progressMid < 150, `progress mid ~111m, got ${progressMid}`);

// GPS leicht Richtung Rückspur (nördlich), aber noch auf Hinfahrt.
const noisyTowardReturn = { lat: 48.00012, lon: 9.0015 };
const globalSnap = snapLatLonToPolyline(poly, noisyTowardReturn, 45);
const nearSnap = snapLatLonToPolylineNearProgress(poly, noisyTowardReturn, progressMid, 45, {
  backtrackM: 30,
  aheadM: 100,
});
assert(nearSnap != null, "near-progress snap exists");
assert(
  nearSnap!.progressM < 200,
  `near snap stays on outbound progress=${nearSnap!.progressM}`,
);
assert(
  Math.abs(nearSnap!.point.lat - 48.0) < 0.00005,
  `near snap lat on outbound, lat=${nearSnap!.point.lat}`,
);

assert(globalSnap != null, "global snap exists");
// Global oft auf Rückspur (lat≈48.0002) — Near-Progress nicht.
if (Math.abs(globalSnap!.lat - 48.0002) < 0.00005) {
  assert(
    Math.abs(nearSnap!.point.lat - globalSnap!.lat) > 0.00005,
    "near progress avoids return-leg jump",
  );
}

const n = nearestOnPolylineNearProgress(poly, onOutbound, progressMid, {
  backtrackM: 40,
  aheadM: 200,
});
assert(n != null && n.bestDistM < 5, "onOutbound near progress");

const at = pointAlongPolylineAtProgressM(poly, progressMid);
assert(at != null, "point along progress");
assert(Math.abs(at!.lat - 48.0) < 0.0002, "point on outbound");

console.log("routeRemainingAlongPolyline.selftest: OK");
