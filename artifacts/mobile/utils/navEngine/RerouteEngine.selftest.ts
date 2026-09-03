/**
 * RerouteEngine — Request-Token + Generation-Guard + P5 Ownership.
 *   npx tsx artifacts/mobile/utils/navEngine/RerouteEngine.selftest.ts
 */
import {
  NAV_REROUTE_COOLDOWN_MS,
  beginReroute,
  beginRouteRequest,
  canBeginReroute,
  completeReroute,
  createRerouteEngineState,
  evaluateRouteResponse,
  failReroute,
  invalidateAllRouteRequests,
  invalidateInFlightRouteRequests,
  isRerouteInFlight,
  shouldAcceptRerouteResponse,
} from "./RerouteEngine";
import {
  commitNavigationRoute,
  createNavEngineState,
  nextRouteCommitGeneration,
  resetNavEngineForRoute,
  setNavEngineRerouteInFlight,
} from "./NavigationEngine";
import { createOffRouteTrackerState } from "./OffRouteEngine";
import type { NavRouteSnapshot } from "./types";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

let st = createRerouteEngineState();
assert(canBeginReroute(st, 1000), "1 idle can begin");

const b1 = beginReroute(st, { nowMs: 1000, currentBoundGeneration: 1, navigationSessionId: 10 });
assert(b1 != null, "begin 1");
st = b1!.state;
assert(b1!.requestId === 1, "request id 1");
assert(b1!.invalidateToGeneration === 2, "invalidate gen 2");
assert(isRerouteInFlight(st), "in flight");
assert(!canBeginReroute(st, 2000), "9 no second request while in flight");

assert(shouldAcceptRerouteResponse(st, 1), "accept own");
assert(!shouldAcceptRerouteResponse(st, 99), "10 reject foreign id");

st = completeReroute(st, 1, 2500);
assert(!isRerouteInFlight(st), "complete clears flight");
assert(!shouldAcceptRerouteResponse(st, 1), "10 late after complete rejected");

assert(!canBeginReroute(st, 2500 + NAV_REROUTE_COOLDOWN_MS - 1), "cooldown");
assert(canBeginReroute(st, 2500 + NAV_REROUTE_COOLDOWN_MS), "cooldown ok");

const b2 = beginReroute(st, {
  nowMs: 2500 + NAV_REROUTE_COOLDOWN_MS,
  currentBoundGeneration: 2,
  navigationSessionId: 10,
});
assert(b2 != null, "begin 2");
st = b2!.state;
const staleId = b2!.requestId;
st = failReroute(st, staleId, Date.now());
assert(!shouldAcceptRerouteResponse(st, staleId), "failed request not accepted");

const b3 = beginReroute(st, {
  nowMs: Date.now() + NAV_REROUTE_COOLDOWN_MS + 10,
  currentBoundGeneration: 3,
  navigationSessionId: 10,
});
assert(b3 != null, "begin 3");
st = b3!.state;
assert(!shouldAcceptRerouteResponse(st, staleId), "10 old id cannot overwrite");
assert(shouldAcceptRerouteResponse(st, b3!.requestId), "new id ok");
st = completeReroute(st, b3!.requestId, Date.now());

// --- P5 ---
{
  let s = createRerouteEngineState(7);
  const first = beginRouteRequest(s, {
    nowMs: 10_000,
    currentBoundGeneration: 4,
    navigationSessionId: 7,
    reason: "off_route",
  });
  assert(first != null, "P5 first off_route");
  s = first!.state;
  const second = beginRouteRequest(s, {
    nowMs: 10_100,
    currentBoundGeneration: 4,
    navigationSessionId: 7,
    reason: "off_route",
  });
  assert(second == null, "P5 two off_route → only first authorized");
  assert(shouldAcceptRerouteResponse(s, first!.requestId, 7), "P5 first still owner");
}

{
  let s = createRerouteEngineState(8);
  const off = beginRouteRequest(s, {
    nowMs: 20_000,
    currentBoundGeneration: 1,
    navigationSessionId: 8,
    reason: "off_route",
  });
  s = off!.state;
  const initial = beginRouteRequest(s, {
    nowMs: 20_050,
    currentBoundGeneration: 1,
    navigationSessionId: 8,
    reason: "initial",
  });
  assert(initial != null, "P5 initial supersedes off_route");
  s = initial!.state;
  assert(initial!.supersededRequestId === off!.requestId, "P5 superseded id");
  assert(!shouldAcceptRerouteResponse(s, off!.requestId, 8), "P5 old off_route cannot commit");
  assert(shouldAcceptRerouteResponse(s, initial!.requestId, 8), "P5 initial is owner");
}

{
  let s = createRerouteEngineState(9);
  const recover = beginRouteRequest(s, {
    nowMs: 30_000,
    currentBoundGeneration: 0,
    navigationSessionId: 9,
    reason: "recover",
    cooldownMs: 0,
  });
  s = recover!.state;
  const off = beginRouteRequest(s, {
    nowMs: 30_100,
    currentBoundGeneration: 0,
    navigationSessionId: 9,
    reason: "off_route",
    cooldownMs: 0,
  });
  assert(off == null, "P5 recover + off_route → recover stays, off_route blocked");
  assert(shouldAcceptRerouteResponse(s, recover!.requestId, 9), "P5 recover owner");
}

{
  let s = createRerouteEngineState(11);
  const begun = beginRouteRequest(s, {
    nowMs: 40_000,
    currentBoundGeneration: 2,
    navigationSessionId: 11,
    reason: "off_route",
  });
  s = begun!.state;
  s = invalidateInFlightRouteRequests(s);
  const decision = evaluateRouteResponse(s, {
    requestId: begun!.requestId,
    navigationSessionId: 11,
    mounted: true,
    currentRouteGeneration: 2,
  });
  assert(!decision.ok && decision.dropReason === "not_active", "P5 resume drops inFlight");
}

{
  let s = createRerouteEngineState(12);
  const begun = beginRouteRequest(s, {
    nowMs: 50_000,
    currentBoundGeneration: 2,
    navigationSessionId: 12,
    reason: "off_route",
  });
  s = begun!.state;
  const decision = evaluateRouteResponse(s, {
    requestId: begun!.requestId,
    navigationSessionId: 99,
    mounted: true,
  });
  assert(!decision.ok && decision.dropReason === "stale_session", "P5 session change drops");
}

{
  let s = createRerouteEngineState(13);
  const begun = beginRouteRequest(s, {
    nowMs: 60_000,
    currentBoundGeneration: 1,
    navigationSessionId: 13,
    reason: "initial",
    cooldownMs: 0,
  });
  s = begun!.state;
  s = invalidateAllRouteRequests(s);
  const decision = evaluateRouteResponse(s, {
    requestId: begun!.requestId,
    navigationSessionId: 13,
    mounted: true,
  });
  assert(!decision.ok, "P5 nav end → no commit");
  const unmounted = evaluateRouteResponse(begun!.state, {
    requestId: begun!.requestId,
    navigationSessionId: 13,
    mounted: false,
  });
  assert(!unmounted.ok && unmounted.dropReason === "unmounted", "P5 unmounted drop");
}

{
  let engine = createNavEngineState(20);
  const route: NavRouteSnapshot = {
    polyline: [
      { lat: 48.74, lon: 9.31 },
      { lat: 48.741, lon: 9.31 },
      { lat: 48.742, lon: 9.31 },
    ],
    steps: [
      {
        instruction: "Weiter",
        distanceM: 200,
        lat: 48.741,
        lon: 9.31,
      },
    ],
    authoritativeDistM: 220,
    authoritativeEtaMin: 4,
    generation: 1,
  };
  engine = resetNavEngineForRoute(engine, route, { lat: 48.74, lon: 9.31 });
  engine.offRoute = { ...createOffRouteTrackerState(), consecutiveOffFixes: 3 };
  engine.stepIdx = 4;
  engine.rerouteInFlight = true;
  const genBefore = engine.routeGeneration;
  const expected = nextRouteCommitGeneration(engine);
  assert(expected === genBefore + 1, "P5 next gen is +1");
  const committed = commitNavigationRoute(engine, {
    polyline: route.polyline,
    steps: route.steps,
    authoritativeDistM: route.authoritativeDistM,
    authoritativeEtaMin: route.authoritativeEtaMin,
    at: { lat: 48.74, lon: 9.31 },
    generation: expected,
  });
  assert(committed != null, "P5 commit ok");
  assert(committed!.state.routeGeneration === expected, "P5 generation exactly once");
  assert(committed!.state.routeGeneration === genBefore + 1, "P5 not double-bumped");
  assert(committed!.state.stepIdx === 0, "P5 maneuver reset");
  assert(committed!.state.offRoute.consecutiveOffFixes === 0, "P5 offRoute reset");
  assert(!committed!.state.rerouteInFlight, "P5 inFlight cleared");
  assert(committed!.state.runtime.routeState === "navigating", "P5 routeState navigating");
  assert(committed!.state.runtime.maneuverState == null, "P5 maneuverState reset");
}

{
  let engine = createNavEngineState(21);
  const route: NavRouteSnapshot = {
    polyline: [
      { lat: 48.74, lon: 9.31 },
      { lat: 48.7405, lon: 9.31 },
      { lat: 48.741, lon: 9.31 },
    ],
    steps: [],
    authoritativeDistM: 100,
    authoritativeEtaMin: 2,
    generation: 1,
  };
  engine = resetNavEngineForRoute(engine, route, { lat: 48.74, lon: 9.31 });
  const snapshot = engine.routeGeneration;
  const progress = engine.routeProgressM;
  const failed = commitNavigationRoute(engine, {
    polyline: [{ lat: 48.74, lon: 9.31 }],
    steps: [],
    authoritativeDistM: 1,
    authoritativeEtaMin: 1,
    at: { lat: 48.74, lon: 9.31 },
    generation: 99,
  });
  assert(failed == null, "P5 bad geometry not committed");
  assert(engine.routeGeneration === snapshot, "P5 error keeps generation");
  assert(engine.routeProgressM === progress, "P5 error keeps progress");
}

{
  let engine = createNavEngineState(22);
  engine = setNavEngineRerouteInFlight(engine, true);
  assert(engine.runtime.routeState === "rerouting", "P5 inFlight routeState");
  engine = setNavEngineRerouteInFlight(engine, false);
  assert(engine.runtime.routeState === "navigating", "P5 fail restores navigating");
  assert(engine.runtime.guidanceStale === false, "P5 fail clears stale");
}

console.log("RerouteEngine.selftest: ok");
