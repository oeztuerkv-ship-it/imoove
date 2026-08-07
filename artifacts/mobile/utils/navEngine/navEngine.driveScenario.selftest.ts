/**
 * Längere Architektur-Simulationsfahrt (kein RN / kein MapKit).
 * Mehrere Minuten GPS-Ticks, mehrere Kreuzungen, bewusstes Falschabbiegen.
 *
 *   npx tsx artifacts/mobile/utils/navEngine/navEngine.driveScenario.selftest.ts
 *
 * Deckt: progress-locked Snap, eine Enhanced Location (display), keine
 * Fehl-Reroutes an Kreuzungen, Off-Route nach Missed Turn.
 */
import {
  createNavEngineState,
  resetNavEngineForRoute,
  tickNavEngine,
} from "./NavigationEngine";
import type { NavEngineState, NavRouteSnapshot } from "./types";
import { haversineMeters } from "../liveDriverMarkerMotion";
import { canStartReroute, createOffRouteTrackerState } from "../navOffRouteReroute";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

/** ~0.00001° lat ≈ 1.11 m; lon bei 48° ≈ 0.74 m. */
function dest(lat: number, lon: number, northM: number, eastM: number) {
  return {
    lat: lat + northM / 111_320,
    lon: lon + eastM / (111_320 * Math.cos((lat * Math.PI) / 180)),
  };
}

/**
 * Stadt-Raster: Ost → Nord → Ost → Süd → Ost (4 Kreuzungen).
 * Gesamtlänge ~1.2 km → bei 10 m/s ≈ 2 min reine Fahrzeit; mit Ticks länger.
 */
const origin = { lat: 48.775, lon: 9.182 };
const p0 = origin;
const p1 = dest(p0.lat, p0.lon, 0, 420); // Ost 420 m
const p2 = dest(p1.lat, p1.lon, 320, 0); // Nord 320 m
const p3 = dest(p2.lat, p2.lon, 0, 380); // Ost 380 m
const p4 = dest(p3.lat, p3.lon, -280, 0); // Süd 280 m
const p5 = dest(p4.lat, p4.lon, 0, 350); // Ost 350 m

const route: NavRouteSnapshot = {
  polyline: [p0, p1, p2, p3, p4, p5],
  steps: [
    {
      instruction: "Weiterfahren",
      maneuver: "Weiterfahren",
      roadName: "Oststraße A",
      distanceM: 300,
      lat: p1.lat,
      lon: p1.lon,
    },
    {
      instruction: "Links abbiegen",
      maneuver: "Links abbiegen",
      roadName: "Nordstraße",
      distanceM: 250,
      lat: p2.lat,
      lon: p2.lon,
    },
    {
      instruction: "Rechts abbiegen",
      maneuver: "Rechts abbiegen",
      roadName: "Oststraße B",
      distanceM: 280,
      lat: p3.lat,
      lon: p3.lon,
    },
    {
      instruction: "Rechts abbiegen",
      maneuver: "Rechts abbiegen",
      roadName: "Südstraße",
      distanceM: 200,
      lat: p4.lat,
      lon: p4.lon,
    },
    {
      instruction: "Links abbiegen",
      maneuver: "Links abbiegen",
      roadName: "Oststraße C",
      distanceM: 220,
      lat: p5.lat,
      lon: p5.lon,
    },
  ],
  authoritativeDistM: 1750,
  authoritativeEtaMin: 5,
};

type Leg = { from: typeof p0; to: typeof p0; courseDeg: number; speedMps: number };

const legs: Leg[] = [
  { from: p0, to: p1, courseDeg: 90, speedMps: 10 },
  { from: p1, to: p2, courseDeg: 0, speedMps: 9 },
  { from: p2, to: p3, courseDeg: 90, speedMps: 11 },
  { from: p3, to: p4, courseDeg: 180, speedMps: 8 },
  { from: p4, to: p5, courseDeg: 90, speedMps: 10 },
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

type TickStats = {
  ticks: number;
  durationMs: number;
  falseOffRoute: number;
  maxDisplayFilteredM: number;
  maxProgressDropM: number;
  snapMissWhileOnRoute: number;
  intersectionsPassed: number;
};

function driveOnRoute(
  stateIn: NavEngineState,
  startMs: number,
): { state: NavEngineState; stats: TickStats; t: number } {
  let state = stateIn;
  let t = startMs;
  let prevProgress = state.routeProgressM;
  const stats: TickStats = {
    ticks: 0,
    durationMs: 0,
    falseOffRoute: 0,
    maxDisplayFilteredM: 0,
    maxProgressDropM: 0,
    snapMissWhileOnRoute: 0,
    intersectionsPassed: 0,
  };
  const t0 = t;

  for (let li = 0; li < legs.length; li++) {
    const leg = legs[li]!;
    const lenM = haversineMeters(leg.from.lat, leg.from.lon, leg.to.lat, leg.to.lon);
    const dtSec = 1;
    const steps = Math.max(4, Math.ceil(lenM / (leg.speedMps * dtSec)));
    for (let s = 0; s <= steps; s++) {
      const frac = s / steps;
      // Leichtes GPS-Rauschen (~3–6 m) — wie Stadt-Canyon mild
      const jitterN = Math.sin(t / 700) * 4;
      const jitterE = Math.cos(t / 900) * 3;
      const base = {
        lat: lerp(leg.from.lat, leg.to.lat, frac),
        lon: lerp(leg.from.lon, leg.to.lon, frac),
      };
      const gps = dest(base.lat, base.lon, jitterN, jitterE);
      t += dtSec * 1000;
      const r = tickNavEngine(
        state,
        {
          lat: gps.lat,
          lon: gps.lon,
          speedMps: leg.speedMps,
          courseDeg: leg.courseDeg,
          nowMs: t,
        },
        route,
      );
      state = r.state;
      stats.ticks += 1;

      if (r.output.confirmedOffRoute) stats.falseOffRoute += 1;

      const df = haversineMeters(
        r.output.display.lat,
        r.output.display.lon,
        r.output.filtered.lat,
        r.output.filtered.lon,
      );
      if (df > stats.maxDisplayFilteredM) stats.maxDisplayFilteredM = df;

      const drop = prevProgress - state.routeProgressM;
      if (drop > stats.maxProgressDropM) stats.maxProgressDropM = drop;
      prevProgress = state.routeProgressM;

      // Auf Route erwarten wir Snap (außer am allerersten Sample)
      if (stats.ticks > 3 && !r.output.snapped) stats.snapMissWhileOnRoute += 1;

      // Enhanced location: display ist die Kamera-/Marker-Pose
      assert(
        Number.isFinite(r.output.display.lat) && Number.isFinite(r.output.display.lon),
        "display finite",
      );
      assert(r.output.heading != null && Number.isFinite(r.output.heading), "heading set");
      assert(!r.output.guidanceStale, "not stale on-route");
    }
    stats.intersectionsPassed += 1;
  }

  stats.durationMs = t - t0;
  return { state, stats, t };
}

function driveWrongTurn(
  stateIn: NavEngineState,
  startMs: number,
): { confirmedAtTick: number | null; ticks: number; t: number; state: NavEngineState } {
  // Am Ende von Leg 0 (Kreuzung p1): statt Nord weiter Ost (Falschabbiegen)
  let state = stateIn;
  let t = startMs;
  let confirmedAtTick: number | null = null;
  const wrongFrom = p1;
  // 80 m Ost statt Nord — klar off route
  const wrongTo = dest(p1.lat, p1.lon, 0, 80);

  for (let s = 1; s <= 12; s++) {
    const frac = s / 12;
    const gps = {
      lat: lerp(wrongFrom.lat, wrongTo.lat, frac),
      lon: lerp(wrongFrom.lon, wrongTo.lon, frac),
    };
    t += 1000;
    const r = tickNavEngine(
      state,
      { lat: gps.lat, lon: gps.lon, speedMps: 9, courseDeg: 90, nowMs: t },
      route,
    );
    state = r.state;
    if (r.output.confirmedOffRoute && confirmedAtTick == null) {
      confirmedAtTick = s;
    }
  }
  return { confirmedAtTick, ticks: 12, t, state };
}

// ── Run ──────────────────────────────────────────────────────────────
let state = createNavEngineState();
state = resetNavEngineForRoute(state, route, p0, { headingDeg: 90 });

const onRoute = driveOnRoute(state, 1_000_000);
state = onRoute.state;

console.log("--- On-route drive ---");
console.log(
  JSON.stringify(
    {
      ticks: onRoute.stats.ticks,
      durationSec: Math.round(onRoute.stats.durationMs / 1000),
      intersections: onRoute.stats.intersectionsPassed,
      falseOffRoute: onRoute.stats.falseOffRoute,
      maxDisplayFilteredM: Math.round(onRoute.stats.maxDisplayFilteredM * 10) / 10,
      maxProgressDropM: Math.round(onRoute.stats.maxProgressDropM * 10) / 10,
      snapMissWhileOnRoute: onRoute.stats.snapMissWhileOnRoute,
      finalProgressM: Math.round(state.routeProgressM),
    },
    null,
    2,
  ),
);

assert(onRoute.stats.ticks >= 100, `enough ticks (>=100), got ${onRoute.stats.ticks}`);
assert(
  onRoute.stats.durationMs >= 180_000,
  `>= 3 min simulated, got ${Math.round(onRoute.stats.durationMs / 1000)}s`,
);
assert(onRoute.stats.intersectionsPassed >= 4, ">= 4 legs/intersections");
assert(onRoute.stats.falseOffRoute === 0, `no false off-route, got ${onRoute.stats.falseOffRoute}`);
assert(
  onRoute.stats.maxProgressDropM < 15,
  `no big progress backtrack, drop=${onRoute.stats.maxProgressDropM}`,
);
assert(
  onRoute.stats.snapMissWhileOnRoute <= 5,
  `snap almost always on route, misses=${onRoute.stats.snapMissWhileOnRoute}`,
);
assert(
  onRoute.stats.maxDisplayFilteredM < 25,
  `display≈filtered on route, maxΔ=${onRoute.stats.maxDisplayFilteredM}`,
);

// Reset to junction p1 and miss the north turn
state = resetNavEngineForRoute(createNavEngineState(), route, p1, { headingDeg: 90 });
// Warm up a few ticks approaching junction on outbound
{
  let t = onRoute.t + 1000;
  for (let i = 0; i < 3; i++) {
    const gps = dest(p1.lat, p1.lon, 0, -20 + i * 8);
    t += 1000;
    const r = tickNavEngine(
      state,
      { lat: gps.lat, lon: gps.lon, speedMps: 9, courseDeg: 90, nowMs: t },
      route,
    );
    state = r.state;
  }
  const wrong = driveWrongTurn(state, t);
  console.log("--- Wrong-turn ---");
  console.log(
    JSON.stringify(
      {
        confirmedAtTick: wrong.confirmedAtTick,
        ticksDrivenWrong: wrong.ticks,
        canStartAfterConfirm: wrong.confirmedAtTick != null,
      },
      null,
      2,
    ),
  );
  assert(wrong.confirmedAtTick != null, "wrong turn → confirmedOffRoute");
  assert(
    wrong.confirmedAtTick! <= 10,
    `off-route within ~10s, got tick ${wrong.confirmedAtTick}`,
  );
  // Reroute gate should open (cooldown fresh)
  const gate = canStartReroute({
    nowMs: wrong.t,
    lastRerouteAtMs: null,
    inFlight: false,
  });
  assert(gate, "reroute can start after wrong turn");
}

// Parallelspur-ähnlicher Kreuzungs-Stress: standing still then move
{
  let s = resetNavEngineForRoute(createNavEngineState(), route, p2, { headingDeg: 90 });
  let t = 2_000_000;
  for (let i = 0; i < 8; i++) {
    t += 1000;
    const r = tickNavEngine(
      s,
      { lat: p2.lat, lon: p2.lon, speedMps: 0.2, courseDeg: -1, nowMs: t },
      route,
    );
    s = r.state;
    assert(!r.output.confirmedOffRoute, "still at junction not off-route");
  }
  // Continue on correct east leg
  for (let i = 1; i <= 15; i++) {
    t += 1000;
    const gps = dest(p2.lat, p2.lon, 0, i * 12);
    const r = tickNavEngine(
      s,
      { lat: gps.lat, lon: gps.lon, speedMps: 10, courseDeg: 90, nowMs: t },
      route,
    );
    s = r.state;
    assert(!r.output.confirmedOffRoute, "after standstill continue on route");
    assert(r.output.snapped || i < 2, "snapped after resume");
  }
}

void createOffRouteTrackerState;

console.log("navEngine.driveScenario.selftest: OK");
