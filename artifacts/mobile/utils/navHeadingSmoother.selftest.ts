/**
 * Smoke: nav heading smoother (kein RN).
 *   npx tsx artifacts/mobile/utils/navHeadingSmoother.selftest.ts
 */
import {
  NAV_HEADING_DEADBAND_DEG,
  NAV_HEADING_MOVING_SPEED_MPS,
  NAV_HEADING_TRUST_COURSE_SPEED_MPS,
  applyNavHeadingSmooth,
  createNavHeadingSmootherState,
  createNavPositionSmootherState,
  headingsAgreeDeg,
  isMovingForNavHeading,
  isUsableCourse,
  pickNavHeadingRaw,
  tickNavHeading,
  tickNavPosition,
} from "./navHeadingSmoother";
import { shortestRotationDelta } from "./liveDriverMarkerMotion";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function approx(a: number, b: number, tol: number, msg: string): void {
  assert(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected ~${b}`);
}

assert(!isUsableCourse(-1), "course -1 invalid");
assert(!isUsableCourse(null), "course null invalid");
assert(isUsableCourse(0), "course 0 valid");
assert(isUsableCourse(359), "course 359 valid");

assert(!isMovingForNavHeading(1.0), "1.0 m/s still");
assert(isMovingForNavHeading(NAV_HEADING_MOVING_SPEED_MPS), "threshold moving");
assert(!isMovingForNavHeading(-1), "speed -1 not moving");

assert(headingsAgreeDeg(10, 20, 15), "agree within");
assert(!headingsAgreeDeg(10, 100, 70), "disagree");

assert(
  pickNavHeadingRaw({
    speedMps: 0.2,
    courseDeg: 90,
    heldHeadingDeg: 10,
    fallbackBearingDeg: 180,
  }) === 10,
  "still → hold",
);

assert(
  pickNavHeadingRaw({
    speedMps: 8,
    courseDeg: 90,
    polylineBearingDeg: 95,
    heldHeadingDeg: 10,
  }) === 90,
  "moving + poly: course wins when agrees with poly",
);

assert(
  pickNavHeadingRaw({
    speedMps: 8,
    courseDeg: 90,
    polylineBearingDeg: 200,
    heldHeadingDeg: 195,
  }) === 200,
  "moving + poly: poly wins when course disagrees",
);

assert(
  pickNavHeadingRaw({
    speedMps: NAV_HEADING_TRUST_COURSE_SPEED_MPS - 0.1,
    courseDeg: 90,
    polylineBearingDeg: 45,
    heldHeadingDeg: 40,
  }) === 45,
  "moving slow: ignore untrusted course, use poly",
);

assert(
  pickNavHeadingRaw({
    speedMps: 8,
    courseDeg: -1,
    polylineBearingDeg: 45,
    movementBearingDeg: 90,
    fallbackBearingDeg: 200,
  }) === 45,
  "moving no course → poly before movement/fallback",
);

assert(
  pickNavHeadingRaw({
    speedMps: 8,
    courseDeg: -1,
    polylineBearingDeg: 200,
    heldHeadingDeg: 10,
    movementBearingDeg: 15,
  }) === 15,
  "poly 180° flip vs held → reject poly, use movement",
);

assert(
  pickNavHeadingRaw({
    speedMps: 8,
    courseDeg: -1,
    movementBearingDeg: 90,
    fallbackBearingDeg: 200,
    heldHeadingDeg: 88,
  }) === 90,
  "moving no course/poly → movement before held",
);

assert(
  pickNavHeadingRaw({
    speedMps: 8,
    courseDeg: -1,
    fallbackBearingDeg: 200,
    heldHeadingDeg: 40,
  }) === 40,
  "moving no course/poly/movement → hold, NOT destination fallback",
);

assert(
  pickNavHeadingRaw({
    speedMps: 8,
    courseDeg: -1,
    fallbackBearingDeg: 200,
  }) === null,
  "moving cold start without sources → null (no destination hunt)",
);

let state = createNavHeadingSmootherState();
let out = applyNavHeadingSmooth(state, 10, 1000);
assert(out.heading === 10, "first snap");
state = out.state;

out = applyNavHeadingSmooth(state, 10 + NAV_HEADING_DEADBAND_DEG / 2, 1100);
assert(out.heading === 10, "deadband holds");
state = out.state;

out = applyNavHeadingSmooth(state, 40, 1200);
assert(out.heading != null && out.heading > 10 && out.heading < 40, "EMA steps toward");
state = out.state;

// Rate limit: huge jump in tiny dt
state = { heading: 0, lastUpdateMs: 2000 };
out = applyNavHeadingSmooth(state, 180, 2016);
assert(out.heading != null, "rate limit returns heading");
assert(
  Math.abs(shortestRotationDelta(0, out.heading!)) < 5,
  `rate limit caps step, got Δ=${shortestRotationDelta(0, out.heading!)}`,
);

state = createNavHeadingSmootherState();
out = tickNavHeading(state, {
  speedMps: 0,
  courseDeg: 270,
  fallbackBearingDeg: 45,
  nowMs: 3000,
});
assert(out.heading === 270, "still bootstrap from course");
state = out.state;
out = tickNavHeading(state, {
  speedMps: 0,
  courseDeg: 10,
  nowMs: 3200,
});
approx(out.heading ?? -1, 270, 1, "still keeps held despite noisy course");

let pos = createNavPositionSmootherState();
let posOut = tickNavPosition(pos, 52.5, 13.4);
assert(posOut.lat === 52.5 && posOut.lon === 13.4, "pos first snap");
pos = posOut.state;
posOut = tickNavPosition(pos, 52.6, 13.5);
assert(posOut.lat > 52.5 && posOut.lat < 52.6, "pos EMA between");
assert(posOut.lon > 13.4 && posOut.lon < 13.5, "pos lon EMA between");

console.log("navHeadingSmoother.selftest: OK");
