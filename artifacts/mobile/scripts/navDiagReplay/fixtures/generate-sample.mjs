/**
 * Erzeugt das synthetische Beispiel-Log (Fixture) mit den PRODUKTIVEN Engines.
 * Das Log hat exakt das Format von navRuntimeDiag.ts (Transcript-Zeilen), die aufgezeichneten Werte
 * (heading, forwardDistM, confirmedOffRoute, …) stammen aus der Engine → Replay muss sie reproduzieren.
 *
 *   npx tsx scripts/navDiagReplay/fixtures/generate-sample.mjs
 *
 * Szenario: Route Nord→Ost, GPS-Lücke (Tunnel), falsch abbiegen (geradeaus), 1. Reroute-Request hängt (Timeout 12 s),
 * Cooldown-Abweisung, 2. Request erfolgreich (Commit Generation 2), danach eine verspätete stale Response.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  commitNavigationRoute, createNavEngineState, setNavEngineRerouteInFlight, tickNavEngine,
} from "../../../utils/navEngine/NavigationEngine.ts";
import * as RE from "../../../utils/navEngine/RerouteEngine.ts";
import { normalizeRouteBundle } from "../replay.ts";

const here = dirname(fileURLToPath(import.meta.url));
const LAT0 = 48.74, LON0 = 9.31;
const mLat = 111_320, mLon = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const r6 = (n) => Math.round(n * 1e6) / 1e6;
const ll = (x, y) => ({ lat: r6(LAT0 + y / mLat), lon: r6(LON0 + x / mLon) });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const brg = (a, b) => ((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI + 360) % 360;
function dens(pts, step = 30) { const o = [pts[0]]; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.round(dist(a, b) / step)); for (let k = 1; k <= n; k++) o.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }); } return o; }
const plen = (p) => { let s = 0; for (let i = 1; i < p.length; i++) s += dist(p[i - 1], p[i]); return s; };
function at(p, s) { let acc = 0; for (let i = 1; i < p.length; i++) { const d = dist(p[i - 1], p[i]); if (acc + d >= s) { const f = (s - acc) / d; return { pt: { x: p[i - 1].x + (p[i].x - p[i - 1].x) * f, y: p[i - 1].y + (p[i].y - p[i - 1].y) * f }, hdg: brg(p[i - 1], p[i]) }; } acc += d; } return { pt: p[p.length - 1], hdg: brg(p[p.length - 2], p[p.length - 1]) }; }
function apiRoute(pts) {
  const poly = dens(pts); const len = plen(poly);
  const steps = [];
  for (let i = 1; i < pts.length - 1; i++) { const right = ((brg(pts[i], pts[i + 1]) - brg(pts[i - 1], pts[i]) + 360) % 360) < 180; steps.push({ instruction: right ? "Rechts abbiegen" : "Links abbiegen", maneuver: right ? "Rechts abbiegen" : "Links abbiegen", roadName: "Teststraße", distanceM: Math.round(dist(pts[i - 1], pts[i])), ...ll(pts[i].x, pts[i].y) }); }
  steps.push({ instruction: "Ziel erreicht", maneuver: "Ziel erreicht", roadName: null, distanceM: 0, ...ll(pts[pts.length - 1].x, pts[pts.length - 1].y) });
  return { distanceKm: Math.round(len) / 1000, durationMinutes: Math.max(1, Math.round(len / 10 / 60)), polyline: poly.map((p) => { const q = ll(p.x, p.y); return [q.lat, q.lon]; }), steps };
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
let R = rng(20260919);
const gauss = () => Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(2 * Math.PI * R());

// Routen
const ORIGINAL = [{ x: 0, y: 0 }, { x: 0, y: 250 }, { x: 250, y: 250 }];
const TRUTH = dens([{ x: 0, y: 0 }, { x: 0, y: 420 }, { x: 320, y: 420 }], 5); // Fahrer fährt am Abzweig geradeaus
const REROUTE_TO = (cur) => [cur, { x: cur.x, y: 420 }, { x: 320, y: 420 }];
const routeFile = { initial: apiRoute(ORIGINAL), reroutes: [] };
// Reroute-Geometrie hängt von der Position beim Commit ab → vorab bestimmen (deterministisch, siehe unten "committedAt")
let bundle = null;

const BASE = Date.UTC(2026, 8, 19, 14, 3, 10, 0);
const clock = (ms) => new Date(ms).toISOString().slice(11, 23);
const lines = [];
let maxMs = 0;
const log = (ms, kind, payload) => { maxMs = Math.max(maxMs, ms); lines.push(`${clock(ms)} ${kind} ${JSON.stringify(payload)}`); };

function run(rerouteRoute) {
  lines.length = 0;
  maxMs = 0;
  R = rng(20260919); // je Durchlauf gleicher Rauschstrom → deterministisch
  const b = normalizeRouteBundle({ initial: routeFile.initial, reroutes: rerouteRoute ? [rerouteRoute] : [] });
  let st = createNavEngineState(1);
  let rr = RE.createRerouteEngineState(1);
  let routeBound = false;
  const pending = []; // {atMs, fn}
  let appReq = 0;
  const seenHeading = { key: "" };
  const info = { commitPos: null };
  let gpsN = 0;
  log(BASE, "gps_watch_mount", { rideId: "fixture" });

  let s = 0;
  const truthLen = plen(TRUTH);
  const times = [];
  for (let sec = 1; sec <= 90; sec++) times.push(sec * 1000);
  const flush = (upToMs) => { for (;;) { pending.sort((a, b) => a.atMs - b.atMs); if (!pending.length || pending[0].atMs > upToMs) return; pending.shift().fn(); } };

  for (const rel of times) {
    const tMs = BASE + rel;
    flush(tMs - 1);
    // Fahrt: 10 m/s (Kurve: 6 m/s)
    const v = 10;
    const inGap = rel > 8000 && rel < 17000; // Tunnel: keine Fixes
    if (s >= truthLen) break; // Ziel erreicht — keine weiteren Ticks
    const prevS = s; s = Math.min(truthLen, s + v);
    if (inGap) continue;
    const { pt, hdg } = at(TRUTH, s);
    const raw = ll(pt.x + gauss() * 3, pt.y + gauss() * 3);
    const speed = Math.round((v + gauss() * 0.4) * 100) / 100;
    const course = Math.round(((hdg + gauss() * 4 + 360) % 360) * 100) / 100;
    const fix = { lat: raw.lat, lon: raw.lon, speedMps: speed, courseDeg: course, nowMs: tMs };
    const tick = tickNavEngine(st, fix, undefined, { sessionId: 1 });
    st = tick.state; const nav = tick.navigation; gpsN++;
    const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
    log(tMs, "gps_tick", {
      n: gpsN, source: gpsN === 1 ? "boot" : "watch", tickNavEngine: true, engineError: null,
      rawGps: { lat: raw.lat, lon: raw.lon, speed, course },
      filtered: nav.filteredPosition ? { lat: r6(nav.filteredPosition.lat), lon: r6(nav.filteredPosition.lon) } : null,
      display: nav.displayPosition ? { lat: r6(nav.displayPosition.lat), lon: r6(nav.displayPosition.lon) } : null,
      markerOn: nav.isSnapped ? "snapped_polyline" : "filtered_or_raw_gps",
      heading: nav.heading, speedMps: nav.speed, progressM: nav.routeProgress, forwardDistM: tick.diag.forwardDistM,
      routeBearingDeg: tick.diag.routeBearingDeg, courseForOffDeg: tick.diag.courseForOffDeg, headingDeltaDeg: tick.diag.headingDeltaDeg,
      confirmedOffRoute: nav.confirmedOffRoute, offRouteTrueForMs: null, guidanceStale: nav.guidanceStale,
      remainingDistM: nav.remainingDistM, distToManeuverM: nav.distToManeuverM, cameraZoom: null, cameraPitch: null,
      polylinePoints: st.boundRoute?.polyline.length ?? 0, stepIdx: st.stepIdx, rerouteInFlight: st.rerouteInFlight,
    });
    const hk = `${nav.headingState}|${nav.headingReason}`;
    if (hk !== seenHeading.key) { seenHeading.key = hk; log(tMs, "heading_transition", { rawHeading: nav.rawHeading, resolvedHeading: nav.heading, headingState: nav.headingState, headingAccuracy: null, speed: nav.speed, reason: nav.headingReason }); }

    // Initial-Route: nach dem 2. Tick (App lädt Route asynchron)
    if (gpsN === 2 && !routeBound) {
      const begun = RE.beginRouteRequest(rr, { nowMs: tMs + 400, currentBoundGeneration: st.routeGeneration, navigationSessionId: 1, reason: "initial", cooldownMs: 0 });
      rr = begun.state; st = setNavEngineRerouteInFlight(st, true);
      const id = ++appReq; const exp = begun.request.expectedCommitGeneration; const reqId = begun.requestId;
      pending.push({ atMs: tMs + 400, fn: () => {
        const c = commitNavigationRoute(st, { polyline: b.initial.polyline, steps: b.initial.steps, authoritativeDistM: b.initial.authoritativeDistM, authoritativeEtaMin: b.initial.authoritativeEtaMin, at: st.runtime.displayPosition, generation: exp });
        st = c.state; rr = RE.completeReroute(rr, reqId, tMs + 400); st = setNavEngineRerouteInFlight(st, false); routeBound = true;
        log(tMs + 400, "route_commit", { sessionId: 1, requestId: id, reason: "initial", routeGenerationStart: exp - 1, routeGenerationCurrent: st.routeGeneration, result: "committed", dropReason: null });
      } });
    }

    // Off-Route → Reroute (wie navigation.tsx onNavFix)
    if (routeBound && nav.confirmedOffRoute && !RE.isRerouteInFlight(rr)) {
      const from = { lat: raw.lat, lon: raw.lon };
      log(tMs, "reroute_decision", { willRequest: true, reason: "off_route", forwardDistM: tick.diag.forwardDistM, headingDeltaDeg: tick.diag.headingDeltaDeg, progressM: nav.routeProgress, confirmedOffRoute: true, inFlight: false, from, msSinceSession: rel, msSinceLastRerouteRequest: null });
      log(tMs, "reroute_request_start", { reason: "reroute", from, offRouteTrueForMs: null, at: new Date(tMs).toISOString() });
      const begun = RE.beginRouteRequest(rr, { nowMs: tMs, currentBoundGeneration: st.routeGeneration, navigationSessionId: 1, reason: "off_route" });
      if (!begun) {
        log(tMs, "reroute_request_done", { reason: "reroute", ok: false, elapsedMs: 0 });
      } else {
        rr = begun.state; st = setNavEngineRerouteInFlight(st, true);
        const id = ++appReq; const exp = begun.request.expectedCommitGeneration; const reqId = begun.requestId;
        const hangs = id === 2; // erster Reroute-Request hängt → Client-Timeout 12 s
        const doneAt = tMs + (hangs ? 12000 : 1500);
        pending.push({ atMs: doneAt, fn: () => {
          if (hangs) {
            rr = RE.failReroute(rr, reqId, doneAt); st = setNavEngineRerouteInFlight(st, RE.isRerouteInFlight(rr));
            log(doneAt, "route_commit", { sessionId: 1, requestId: id, reason: "off_route", routeGenerationStart: exp - 1, routeGenerationCurrent: st.routeGeneration, result: "failed", dropReason: null });
            log(doneAt, "reroute_request_done", { reason: "reroute", ok: false, elapsedMs: 12000 });
            return;
          }
          // aktuelle wahre Position beim Commit
          const cur = at(TRUTH, Math.min(truthLen, prevS + 0)).pt;
          const curNow = st.runtime.displayPosition ? { x: (st.runtime.displayPosition.lon - LON0) * mLon, y: (st.runtime.displayPosition.lat - LAT0) * mLat } : cur;
          if (!info.commitPos) info.commitPos = { x: Math.round(curNow.x), y: Math.round(curNow.y) };
          const route = b.reroutes[0];
          const c = commitNavigationRoute(st, { polyline: route.polyline, steps: route.steps, authoritativeDistM: route.authoritativeDistM, authoritativeEtaMin: route.authoritativeEtaMin, at: st.runtime.displayPosition, generation: exp });
          st = c.state; rr = RE.completeReroute(rr, reqId, doneAt); st = setNavEngineRerouteInFlight(st, false);
          log(doneAt, "route_commit", { sessionId: 1, requestId: id, reason: "off_route", routeGenerationStart: exp - 1, routeGenerationCurrent: st.routeGeneration, result: "committed", dropReason: null });
          log(doneAt, "reroute_request_done", { reason: "reroute", ok: true, elapsedMs: 1500 });
          // verspätete Response eines älteren Requests → stale
          if (!info.staleSent) { info.staleSent = true; pending.push({ atMs: doneAt + 2500, fn: () => log(doneAt + 2500, "route_commit", { sessionId: 1, requestId: 9, reason: "off_route", routeGenerationStart: 1, routeGenerationCurrent: st.routeGeneration, result: "dropped_stale", dropReason: "stale_generation" }) }); }
        } });
      }
    }
  }
  flush(BASE + 200_000);
  log(maxMs + 1000, "gps_watch_unmount", { rideId: "fixture" });
  return { text: lines.join("\n"), commitPos: info.commitPos };
}

// Pass 1 ohne Reroute-Geometrie → Commit-Position; Pass 2 mit passender Geometrie (Position beim Commit)
let pass1 = run({ ...apiRoute([{ x: 0, y: 300 }, { x: 0, y: 420 }, { x: 320, y: 420 }]) });
const cp = pass1.commitPos ?? { x: 0, y: 300 };
const rerouteGeo = apiRoute([{ x: cp.x, y: cp.y }, { x: cp.x, y: 420 }, { x: 320, y: 420 }]);
const final = run(rerouteGeo);
if (JSON.stringify(final.commitPos) !== JSON.stringify(cp)) throw new Error("Commit-Position nicht stabil — Generator nicht deterministisch?");
const header = `[NavDiag] transcript platform=ios lines=${final.text.split("\n").length} at=2026-09-19T14:05:00.000Z`;
writeFileSync(join(here, "sample-drive.navdiag.txt"), header + "\n" + final.text + "\n");
writeFileSync(join(here, "sample-drive.route.json"), JSON.stringify({ initial: routeFile.initial, reroutes: [rerouteGeo] }, null, 2) + "\n");
console.log("geschrieben: sample-drive.navdiag.txt (" + final.text.split("\n").length + " Zeilen), sample-drive.route.json; commitPos", cp);
