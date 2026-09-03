/**
 * P4: Session-Guard, GPS-Lifecycle, Watch-Idempotenz, Recenter = zentraler Tick.
 *   npx tsx artifacts/mobile/utils/navEngine/navLifecycle.selftest.ts
 */
import { locationCoordsToNavFix } from "./locationCoordsToNavFix";
import {
  acceptNavAsync,
  classifyGpsLifecycle,
  createLocationWatchGuard,
  NAV_GPS_LOST_AFTER_MS,
  NAV_GPS_STALE_AFTER_MS,
  nextNavigationSessionId,
  shouldEvaluateOffRoute,
} from "./navLifecycle";
import { beginNavGpsResync, createNavEngineState, tickNavEngine } from "./NavigationEngine";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

{
  const a = nextNavigationSessionId();
  const b = nextNavigationSessionId();
  assert(b !== a, "session ids unique");
}

{
  assert(
    acceptNavAsync({ mounted: true, sessionId: 1 }, { sessionId: 1 }),
    "live accept",
  );
  assert(
    !acceptNavAsync({ mounted: false, sessionId: 1 }, { sessionId: 1 }),
    "unmount during recenter / getCurrentPosition",
  );
  assert(
    !acceptNavAsync({ mounted: true, sessionId: 2 }, { sessionId: 1 }),
    "stale GPS callback after session change",
  );
  assert(
    !acceptNavAsync(
      { mounted: true, sessionId: 1, routeGeneration: 4 },
      { sessionId: 1, routeGeneration: 3 },
    ),
    "stale MapReady / route command generation",
  );
}

{
  const now = 100_000;
  assert(classifyGpsLifecycle({ lastFixAt: now, nowMs: now, resyncing: false }) === "ACTIVE", "ACTIVE");
  assert(
    classifyGpsLifecycle({
      lastFixAt: now - NAV_GPS_STALE_AFTER_MS,
      nowMs: now,
      resyncing: false,
    }) === "STALE",
    "STALE after central timeout",
  );
  assert(
    classifyGpsLifecycle({
      lastFixAt: now - NAV_GPS_LOST_AFTER_MS,
      nowMs: now,
      resyncing: false,
    }) === "LOST",
    "LOST after central timeout",
  );
  assert(
    classifyGpsLifecycle({ lastFixAt: now, nowMs: now, resyncing: true }) === "STALE",
    "resync is STALE",
  );
  assert(!shouldEvaluateOffRoute("STALE", false), "STALE does not evaluate OffRoute");
  assert(!shouldEvaluateOffRoute("ACTIVE", true), "resync does not evaluate OffRoute");
  assert(shouldEvaluateOffRoute("ACTIVE", false), "ACTIVE may evaluate OffRoute");
}

{
  const g = createLocationWatchGuard();
  const e1 = g.start();
  assert(g.isLive(e1), "watch live");
  g.start();
  assert(!g.isLive(e1), "old epoch after restart");
  g.stop();
  g.stop();
  const e3 = g.start();
  g.stop();
  assert(!g.isLive(e3), "stop after start");
}

{
  let s = createNavEngineState();
  const session = s.navigationSessionId;
  const fix = locationCoordsToNavFix(
    { latitude: 48.74, longitude: 9.31, speed: 5, heading: 40 },
    50_000,
  );
  assert(!!fix, "recenter coords → NavFix");
  const t = tickNavEngine(s, fix!, null, { sessionId: session });
  assert(t.state !== s, "Recenter uses central tickNavEngine");
  assert(t.navigation.gpsState === "ACTIVE", "recenter tick ACTIVE");
  const stale = tickNavEngine(t.state, fix!, null, { sessionId: session + 1 });
  assert(stale.state === t.state, "old GPS callback ignored");
}

{
  let s = createNavEngineState();
  s = beginNavGpsResync(s);
  assert(s.runtime.lastFixAt == null, "resume waits — lastFixAt cleared");
  const t = tickNavEngine(
    s,
    { lat: 48.74, lon: 9.31, speedMps: 4, courseDeg: 10, nowMs: 80_000 },
    null,
  );
  assert(t.navigation.gpsState === "ACTIVE", "resume fresh fix → ACTIVE");
}

{
  let s = createNavEngineState();
  s = { ...s, runtime: { ...s.runtime, gpsState: "LOST", lastFixAt: 1 } };
  const t = tickNavEngine(
    s,
    { lat: 48.74, lon: 9.31, speedMps: 6, courseDeg: 20, nowMs: 90_000 },
    null,
  );
  assert(t.navigation.gpsState === "ACTIVE", "LOST → fresh fix → ACTIVE");
}

console.log("navLifecycle.selftest: OK");
