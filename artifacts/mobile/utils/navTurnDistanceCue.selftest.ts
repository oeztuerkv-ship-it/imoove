/**
 * Smoke: Live-Distanz zum Manöver entlang Polyline + Wortlaut.
 * Run: npx tsx artifacts/mobile/utils/navTurnDistanceCue.selftest.ts
 */
import {
  formatNavTurnCue,
  formatNavTurnDistanceLabel,
  lowerCaseGermanInstruction,
  roundNavDisplayMeters,
  splitNavStepParts,
} from "./navTurnDistanceCue";
import {
  distanceAlongPolylineToPointM,
  splitPolylineAtProgress,
} from "./routeRemainingAlongPolyline";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function approx(a: number, b: number, tol: number) {
  return Math.abs(a - b) <= tol;
}

// Wortlaut + 10-m-Aufrundung
assert(roundNavDisplayMeters(1) === 10, "ceil 1→10");
assert(roundNavDisplayMeters(4) === 10, "ceil 4→10");
assert(roundNavDisplayMeters(11) === 20, "ceil 11→20");
assert(roundNavDisplayMeters(200) === 200, "200 stays");
assert(formatNavTurnDistanceLabel(10) === "Jetzt", "jetzt");
assert(formatNavTurnDistanceLabel(27) === "In 30 m", "27→30");
assert(formatNavTurnDistanceLabel(200) === "In 200 m", "200m");
assert(formatNavTurnDistanceLabel(1200) === "In 1.2 km", "1.2km");
assert(lowerCaseGermanInstruction("Rechts abbiegen") === "rechts abbiegen", "lower");
assert(
  formatNavTurnCue(200, "Rechts abbiegen auf Hauptstraße") ===
    "In 200 m rechts abbiegen auf Hauptstraße",
  "cue",
);
assert(formatNavTurnCue(10, "Links abbiegen") === "Jetzt links abbiegen", "jetzt cue");

const split1 = splitNavStepParts({
  instruction: "Rechts abbiegen auf Hauptstraße",
  maneuver: "Rechts abbiegen",
  roadName: "Hauptstraße",
});
assert(split1.maneuver === "Rechts abbiegen" && split1.roadName === "Hauptstraße", "split server");
const split2 = splitNavStepParts({ instruction: "Links abbiegen auf Bahnhofstraße" });
assert(split2.maneuver === "Links abbiegen" && split2.roadName === "Bahnhofstraße", "split fallback");

// Gerade Nord-Süd Polyline (~111 m pro 0.001° lat)
const poly = [
  { lat: 48.0, lon: 11.0 },
  { lat: 48.001, lon: 11.0 },
  { lat: 48.002, lon: 11.0 },
];
const atStart = { lat: 48.0, lon: 11.0 };
const mid = { lat: 48.001, lon: 11.0 };
const end = { lat: 48.002, lon: 11.0 };

const dMid = distanceAlongPolylineToPointM(poly, atStart, mid);
assert(dMid != null && approx(dMid, 111, 20), `mid ~111 got ${dMid}`);

const dEnd = distanceAlongPolylineToPointM(poly, atStart, end);
assert(dEnd != null && approx(dEnd, 222, 30), `end ~222 got ${dEnd}`);

const dPast = distanceAlongPolylineToPointM(poly, end, mid);
assert(dPast === 0, `past maneuver → 0 got ${dPast}`);

const dHalf = distanceAlongPolylineToPointM(poly, { lat: 48.0005, lon: 11.0 }, end);
assert(dHalf != null && approx(dHalf, 167, 30), `half→end ~167 got ${dHalf}`);

const splitMid = splitPolylineAtProgress(poly, mid);
assert(!!splitMid && splitMid.traveled.length >= 2, "split traveled");
assert(!!splitMid && splitMid.remaining.length >= 2, "split remaining");
const splitStart = splitPolylineAtProgress(poly, atStart);
assert(!!splitStart && splitStart.traveled.length === 0, "start: no traveled trail");
assert(!!splitStart && splitStart.remaining.length >= 2, "start: remaining full");

console.log("navTurnDistanceCue.selftest: ok");
