import { FUNK_GPS_FRESH_MS } from "../db/funkDispatchData";
import { isFleetLiveGpsFresh } from "../db/fleetLiveData";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const now = Date.now();

assert(isFleetLiveGpsFresh(now, now), "now is fresh");
assert(isFleetLiveGpsFresh(now - FUNK_GPS_FRESH_MS + 1_000, now), "just inside window");
assert(!isFleetLiveGpsFresh(now - FUNK_GPS_FRESH_MS - 1_000, now), "outside window stale");
assert(!isFleetLiveGpsFresh(NaN, now), "NaN at rejected");
assert(FUNK_GPS_FRESH_MS === 3 * 60_000, "fresh window matches Funk 3 min");

console.log("fleetLiveGpsFreshSelftest: OK");
