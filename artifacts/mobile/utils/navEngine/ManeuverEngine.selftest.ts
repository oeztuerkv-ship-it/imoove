/**
 * ManeuverEngine — Progress-basierte Guidance.
 *   npx tsx artifacts/mobile/utils/navEngine/ManeuverEngine.selftest.ts
 */
import { progressAlongPolylineAt } from "../routeRemainingAlongPolyline";
import {
  advanceManeuverStepIdx,
  buildManeuverOut,
  classifyManeuverKind,
  NAV_MANEUVER_PASS_WITHIN_M,
} from "./ManeuverEngine";
import { distanceAlongRouteFromProgressM } from "./RouteProgressEngine";
import type { NavRouteStep } from "./types";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

/** ~111m pro 0.001° lat */
const poly = [
  { lat: 48.74, lon: 9.31 },
  { lat: 48.741, lon: 9.31 },
  { lat: 48.742, lon: 9.31 },
  { lat: 48.743, lon: 9.31 },
  { lat: 48.743, lon: 9.311 },
];

const steps: NavRouteStep[] = [
  {
    instruction: "Fahrt beginnen",
    maneuver: "Fahrt beginnen",
    roadName: null,
    distanceM: 0,
    lat: 48.74,
    lon: 9.31,
  },
  {
    instruction: "Weiterfahren auf Teststraße",
    maneuver: "Weiterfahren",
    roadName: "Teststraße",
    distanceM: 220,
    lat: 48.742,
    lon: 9.31,
  },
  {
    instruction: "Rechts abbiegen auf Königstraße",
    maneuver: "Rechts abbiegen",
    roadName: "Königstraße",
    distanceM: 80,
    lat: 48.743,
    lon: 9.31,
  },
  {
    instruction: "Links abbiegen auf Nebenstraße",
    maneuver: "Links abbiegen",
    roadName: "Nebenstraße",
    distanceM: 40,
    lat: 48.743,
    lon: 9.311,
  },
  {
    instruction: "Im Kreisverkehr die 2. Ausfahrt",
    maneuver: "Kreisverkehr",
    roadName: "Ring",
    distanceM: 20,
    lat: 48.743,
    lon: 9.311,
  },
  {
    instruction: "Wenden",
    maneuver: "Wenden",
    roadName: null,
    distanceM: 10,
    lat: 48.743,
    lon: 9.311,
  },
  {
    instruction: "Ziel erreicht",
    maneuver: "Ziel erreicht",
    roadName: null,
    distanceM: 0,
    lat: 48.743,
    lon: 9.311,
  },
];

// classify
assert(classifyManeuverKind("Weiterfahren") === "straight", "a straight");
assert(classifyManeuverKind("Rechts abbiegen") === "right", "b right");
assert(classifyManeuverKind("Links abbiegen") === "left", "c left");
assert(classifyManeuverKind("Im Kreisverkehr die 2. Ausfahrt") === "roundabout", "e roundabout");
assert(classifyManeuverKind("Wenden") === "uturn", "f uturn");
assert(classifyManeuverKind("Ziel erreicht") === "arrive", "g arrive");

// (a) Geradeaus am Start — Depart überspringen → Weiterfahren
let out = buildManeuverOut(steps, 0, poly, false, {
  committedProgressM: 5,
  routeGeneration: 1,
  boundRouteGeneration: 1,
});
assert(out.maneuver != null, "maneuver present");
assert(out.maneuver!.kind === "straight", "start straight kind");
assert(out.stepIdx === 1, `skip depart → idx 1 got ${out.stepIdx}`);

// (j) Distanz = kanonischer Progress
const rightProg = progressAlongPolylineAt(poly, { lat: 48.743, lon: 9.31 })!;
const atBeforeRight = Math.max(0, rightProg - 111);
const expectedDist = distanceAlongRouteFromProgressM(poly, atBeforeRight, {
  lat: 48.743,
  lon: 9.31,
});
out = buildManeuverOut(steps, 1, poly, false, {
  committedProgressM: atBeforeRight,
  routeGeneration: 1,
  boundRouteGeneration: 1,
});
assert(out.maneuver?.kind === "right" || out.stepIdx === 2, "approaching right");
assert(out.distToManeuverM === expectedDist, `j dist ${out.distToManeuverM} vs ${expectedDist}`);
assert(out.maneuver?.distanceM === out.distToManeuverM, "maneuver.distanceM === distToManeuverM");

// (b)(d) Advance past right by progress → left
const pastRight = rightProg + 5;
const idx = advanceManeuverStepIdx(steps, 2, poly, pastRight);
assert(idx >= 3, `advanced past right to ${idx}`);

// (c) left guidance
out = buildManeuverOut(steps, 2, poly, false, {
  committedProgressM: pastRight,
  routeGeneration: 1,
  boundRouteGeneration: 1,
});
assert(
  out.maneuver?.kind === "left" ||
    out.maneuver?.kind === "roundabout" ||
    out.maneuver?.kind === "uturn" ||
    out.maneuver?.kind === "arrive",
  `after right: ${out.maneuver?.kind}`,
);

// (h) Reroute / guidanceStale
out = buildManeuverOut(steps, 1, poly, true, {
  committedProgressM: 50,
  routeGeneration: 1,
  boundRouteGeneration: 1,
});
assert(out.maneuver == null && out.distToManeuverM === 0, "h stale → no guidance");

// (i) alte Generation
out = buildManeuverOut(steps, 1, poly, false, {
  committedProgressM: 50,
  routeGeneration: 1,
  boundRouteGeneration: 2,
});
assert(out.maneuver == null, "i old generation → no guidance");

// Neue Generation liefert Guidance
out = buildManeuverOut(steps, 0, poly, false, {
  committedProgressM: 10,
  routeGeneration: 2,
  boundRouteGeneration: 2,
});
assert(out.maneuver != null, "new generation ok");
assert(out.maneuver!.roadName === "Teststraße" || out.maneuver!.kind === "straight", "road/maneuver");

assert(NAV_MANEUVER_PASS_WITHIN_M === 25, "pass threshold");

console.log("ManeuverEngine.selftest: ok");
