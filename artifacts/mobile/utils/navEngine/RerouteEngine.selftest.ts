/**
 * RerouteEngine — Request-Token + Generation-Guard.
 *   npx tsx artifacts/mobile/utils/navEngine/RerouteEngine.selftest.ts
 */
import {
  NAV_REROUTE_COOLDOWN_MS,
  beginReroute,
  canBeginReroute,
  completeReroute,
  createRerouteEngineState,
  failReroute,
  isRerouteInFlight,
  shouldAcceptRerouteResponse,
} from "./RerouteEngine";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

let st = createRerouteEngineState();
assert(canBeginReroute(st, 1000), "1 idle can begin");

const b1 = beginReroute(st, { nowMs: 1000, currentBoundGeneration: 1 });
assert(b1 != null, "begin 1");
st = b1!.state;
assert(b1!.requestId === 1, "request id 1");
assert(b1!.invalidateToGeneration === 2, "invalidate gen 2");
assert(isRerouteInFlight(st), "in flight");
assert(!canBeginReroute(st, 2000), "9 no second request while in flight");

assert(shouldAcceptRerouteResponse(st, 1), "accept own");
assert(!shouldAcceptRerouteResponse(st, 99), "10 reject foreign id");

// Complete → neue Route Generation freigeben
st = completeReroute(st, 1, 2500);
assert(!isRerouteInFlight(st), "complete clears flight");
assert(!shouldAcceptRerouteResponse(st, 1), "10 late after complete rejected");

// Cooldown
assert(!canBeginReroute(st, 2500 + NAV_REROUTE_COOLDOWN_MS - 1), "cooldown");
assert(canBeginReroute(st, 2500 + NAV_REROUTE_COOLDOWN_MS), "cooldown ok");

// Fail path + late discard
const b2 = beginReroute(st, {
  nowMs: 2500 + NAV_REROUTE_COOLDOWN_MS,
  currentBoundGeneration: 2,
});
assert(b2 != null, "begin 2");
st = b2!.state;
const staleId = b2!.requestId;
st = failReroute(st, staleId, Date.now());
assert(!shouldAcceptRerouteResponse(st, staleId), "failed request not accepted");

const b3 = beginReroute(st, {
  nowMs: Date.now() + NAV_REROUTE_COOLDOWN_MS + 10,
  currentBoundGeneration: 3,
});
assert(b3 != null, "begin 3");
st = b3!.state;
assert(!shouldAcceptRerouteResponse(st, staleId), "10 old id cannot overwrite");
assert(shouldAcceptRerouteResponse(st, b3!.requestId), "new id ok");
st = completeReroute(st, b3!.requestId, Date.now());

console.log("RerouteEngine.selftest: ok");
