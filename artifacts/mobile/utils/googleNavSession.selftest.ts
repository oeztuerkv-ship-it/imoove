import { strict as assert } from "node:assert";
import { createGoogleNavWorkQueue, googleRoutePoints, validGoogleNavPoint } from "./googleNavSession";

async function main() {
  const queue = createGoogleNavWorkQueue();
  let release!: () => void;
  const deferred = new Promise<void>((resolve) => { release = resolve; });
  const calls: string[] = [];
  const first = queue.run(async (live) => {
    calls.push("old:setDestination");
    await deferred;
    if (live()) calls.push("old:startGuidance");
  });
  await Promise.resolve();
  const second = queue.run(async (live) => { assert(live()); calls.push("new:startGuidance"); });
  release(); await Promise.all([first, second]);
  assert.deepEqual(calls, ["old:setDestination", "new:startGuidance"]);

  const skipped = createGoogleNavWorkQueue();
  let executed = 0;
  await Promise.all([skipped.run(async () => { executed += 100; }), skipped.run(async () => { executed++; })]);
  assert.equal(executed, 1, "only latest queued destination runs");

  const stopped = createGoogleNavWorkQueue();
  const pending = stopped.run(async () => { throw Error("disposed work ran"); });
  stopped.dispose(); await pending;
  await stopped.run(async () => { throw Error("work after unmount ran"); });

  const failures = createGoogleNavWorkQueue();
  await assert.rejects(failures.run(async () => { throw Error("network"); }));
  let recovered = false;
  await failures.run(async () => { recovered = true; });
  assert(recovered, "a failed native request cannot poison later destination work");

  assert(validGoogleNavPoint(0, 0)); assert(validGoogleNavPoint(-90, 180));
  for (const [lat, lon] of [[NaN, 9], [49, Infinity], [91, 9], [49, -181]]) assert(!validGoogleNavPoint(lat, lon));
  assert.deepEqual(googleRoutePoints([
    { segmentLatLngList: [{ lat: 48, lng: 9 }, { lat: 49, lng: 10 }] },
    { segmentLatLngList: [{ lat: 49, lng: 10 }, { lat: NaN, lng: 0 }, { lat: 50, lng: 11 }] },
  ]), [{ lat: 48, lon: 9 }, { lat: 49, lon: 10 }, { lat: 50, lon: 11 }]);
  assert.deepEqual(googleRoutePoints([]), [], "no invented straight-line route");
  console.log("googleNavSession.selftest: OK (superseded targets, ordering, unmount, recovery, coordinates, actual route geometry)");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
