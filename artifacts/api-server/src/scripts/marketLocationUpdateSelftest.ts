import {
  decideMarketLocationUpdate,
  MARKET_LOCATION_MAX_AGE_MS,
} from "../lib/marketLocationUpdate";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const base = { prevLat: 48.78, prevLon: 9.18, nextLat: 48.9, nextLon: 9.3 }; // ~15 km

const noPrev = decideMarketLocationUpdate({
  prevLat: null,
  prevLon: null,
  nextLat: 48.78,
  nextLon: 9.18,
  lastMarketAt: null,
});
assert(noPrev.accept && noPrev.reason === "no_previous", "empty prev");

const freshReject = decideMarketLocationUpdate({
  ...base,
  lastMarketAt: new Date(Date.now() - 30_000),
  nowMs: Date.now(),
});
assert(!freshReject.accept && freshReject.reason === "outlier_jump", "fresh outlier must reject");

const staleAccept = decideMarketLocationUpdate({
  ...base,
  lastMarketAt: new Date(Date.now() - MARKET_LOCATION_MAX_AGE_MS - 1_000),
  nowMs: Date.now(),
});
assert(staleAccept.accept && staleAccept.reason === "stale_previous", "stale must accept jump");

const nearOk = decideMarketLocationUpdate({
  prevLat: 48.78,
  prevLon: 9.18,
  nextLat: 48.781,
  nextLon: 9.181,
  lastMarketAt: new Date(),
});
assert(nearOk.accept && nearOk.reason === "within_jump", "small move ok");

console.log("marketLocationUpdateSelftest: OK");
