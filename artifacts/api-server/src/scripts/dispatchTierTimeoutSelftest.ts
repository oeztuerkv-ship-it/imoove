import type { RideRequest } from "../domain/rideRequest";
import {
  dispatchTierForPhase,
  getDispatchTierTimeoutSec,
  nextDispatchPhase,
  resolveRideDispatchPhase,
  shouldAdvanceDispatchTierByTimeout,
} from "../lib/dispatchPriorityTier";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

assert(getDispatchTierTimeoutSec(undefined) === 10, "default timeout 10s");
assert(getDispatchTierTimeoutSec({ premiumTierTimeoutSeconds: 60 }) === 60, "config 60 honored");
assert(getDispatchTierTimeoutSec({ premiumTierTimeoutSeconds: 10 }) === 10, "config 10 honored");

assert(nextDispatchPhase("trio_a") === "pool_1", "trio → pool_1");
assert(nextDispatchPhase("pool_1") === "pool_2", "pool_1 → pool_2");
assert(nextDispatchPhase("pool_2") === "open", "pool_2 → open");
assert(nextDispatchPhase("open") === null, "open has no next");
assert(dispatchTierForPhase("trio_a") === "A", "trio visible as A");
assert(dispatchTierForPhase("pool_1") === "B", "pool_1 visible as B");
assert(dispatchTierForPhase("open") === "B", "open visible as B");

const base = {
  id: "r1",
  status: "searching_driver",
  driverId: null,
  scheduledAt: null,
  dispatchMode: "market",
  dispatchTier: "A",
  dispatchPhase: "trio_a",
  createdAt: new Date(Date.now() - 11_000).toISOString(),
  dispatchTierStartedAt: new Date(Date.now() - 11_000).toISOString(),
} as RideRequest;

assert(shouldAdvanceDispatchTierByTimeout(base, 10), "trio elapsed 11s advances");
assert(!shouldAdvanceDispatchTierByTimeout(base, 60), "trio elapsed 11s < 60s does not advance");

const pool1 = {
  ...base,
  dispatchTier: "B",
  dispatchPhase: "pool_1",
} as RideRequest;
assert(shouldAdvanceDispatchTierByTimeout(pool1, 10), "pool_1 timeout advances");

const openRide = {
  ...base,
  dispatchTier: "B",
  dispatchPhase: "open",
} as RideRequest;
assert(!shouldAdvanceDispatchTierByTimeout(openRide, 10), "open does not advance by timeout");
assert(resolveRideDispatchPhase(openRide) === "open", "resolve open");

const legacyB = {
  ...base,
  dispatchTier: "B",
  dispatchPhase: null,
} as RideRequest;
assert(resolveRideDispatchPhase(legacyB) === "open", "legacy B without phase → open");

const fresh = {
  ...base,
  createdAt: new Date().toISOString(),
  dispatchTierStartedAt: new Date().toISOString(),
} as RideRequest;
assert(!shouldAdvanceDispatchTierByTimeout(fresh, 10), "fresh ride does not advance by timeout");

console.log("dispatchTierTimeoutSelftest: OK");
