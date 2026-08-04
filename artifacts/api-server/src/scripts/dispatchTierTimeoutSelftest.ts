import type { RideRequest } from "../domain/rideRequest";
import {
  getDispatchTierTimeoutSec,
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

const base = {
  id: "r1",
  status: "searching_driver",
  driverId: null,
  scheduledAt: null,
  dispatchMode: "market",
  dispatchTier: "A",
  createdAt: new Date(Date.now() - 11_000).toISOString(),
  dispatchTierStartedAt: new Date(Date.now() - 11_000).toISOString(),
} as RideRequest;

assert(shouldAdvanceDispatchTierByTimeout(base, 10), "elapsed 11s >= 10s advances");
assert(!shouldAdvanceDispatchTierByTimeout(base, 60), "elapsed 11s < 60s does not advance");

const fresh = {
  ...base,
  createdAt: new Date().toISOString(),
  dispatchTierStartedAt: new Date().toISOString(),
} as RideRequest;
assert(!shouldAdvanceDispatchTierByTimeout(fresh, 10), "fresh ride does not advance by timeout");

console.log("dispatchTierTimeoutSelftest: OK");
