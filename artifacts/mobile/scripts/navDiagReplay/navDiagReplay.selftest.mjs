/**
 * NavDiag-Replay Selftest (Diagnose-Werkzeug).
 *   npx tsx scripts/navDiagReplay/navDiagReplay.selftest.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseNavDiagLog } from "./parseNavDiag.ts";
import { replayNavDiagText, normalizeRouteBundle } from "./replay.ts";
import { formatReport } from "./format.ts";

const here = dirname(fileURLToPath(import.meta.url));
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
const eq = (a, b, m) => assert(a === b, `${m}: erwartet ${b}, war ${a}`);

const logText = readFileSync(join(here, "fixtures/sample-drive.navdiag.txt"), "utf8");
const bundle = normalizeRouteBundle(JSON.parse(readFileSync(join(here, "fixtures/sample-drive.route.json"), "utf8")));
assert(bundle.initial && bundle.reroutes.length === 1, "Fixture-Routen laden");

// 1) Parser
{
  const p = parseNavDiagLog(logText);
  eq(p.skipped.length, 0, "Fixture ohne übersprungene Zeilen");
  eq(p.events.length, 85, "Fixture-Events");
  eq(p.header?.platform, "ios", "Header platform");
  const kinds = new Set(p.events.map((e) => e.kind));
  for (const k of ["gps_tick", "route_commit", "reroute_decision", "reroute_request_start", "reroute_request_done", "heading_transition", "gps_watch_mount", "gps_watch_unmount"]) {
    assert(kinds.has(k), `Fixture enthält ${k}`);
  }
  // Zeit monoton
  for (let i = 1; i < p.events.length; i++) assert(p.events[i].tMs >= p.events[i - 1].tMs, "Zeit monoton");
}

// 2) Replay mit Route: Golden-Werte + 100 % Parität (Log stammt aus denselben Engines)
const res = replayNavDiagText(logText, { route: bundle });
{
  const s = res.summary;
  eq(s.ticksReplayed, 66, "Ticks");
  eq(s.offRouteEpisodes, 1, "Off-Route-Episoden (Replay)");
  eq(s.offRouteEpisodesInLog, 1, "Off-Route-Episoden (Log)");
  eq(s.reroutesStarted, 2, "Reroutes gestartet");
  eq(s.reroutesRefused, 2, "Reroutes vom Gate abgelehnt (Cooldown)");
  eq(s.timeouts, 1, "Timeouts");
  eq(s.failed, 1, "fehlgeschlagen");
  eq(s.committed, 2, "Commits inkl. initial");
  eq(s.staleResponses, 1, "stale Responses");
  eq(s.staleByReason.stale_generation, 1, "stale_generation");
  eq(s.longestRequestToCommitMs, 1500, "Anfrage→Commit");
  eq(s.longestOffRouteToCommitMs, 16500, "Off-Route→Commit");
  eq(s.finalRouteGeneration, 2, "finale Generation");
  eq(s.parity.headingMaxAbsDeltaDeg, 0, "Parität Heading max");
  eq(s.parity.distToRouteMaxAbsDeltaM, 0, "Parität Abstand max");
  eq(s.parity.offRouteMismatches, 0, "Parität Off-Route");
  eq(s.parity.staleMismatches, 0, "Parität stale");
  eq(s.parity.generationMismatches, 0, "Parität Generation");

  const tl = res.timeline.map((e) => `${e.type}|${e.detail}`);
  const has = (t, frag) => assert(tl.some((x) => x.startsWith(t) && x.includes(frag)), `Timeline: ${t} ${frag}`);
  has("state:gpsState", "ACTIVE → STALE");
  has("state:gpsState", "STALE → LOST");
  has("state:gpsState", "LOST → ACTIVE");
  has("state:headingState", "VALID");
  has("state:offRoute", "false → true");
  has("reroute_started", "reason=reroute");
  has("reroute_timeout", "elapsed=12000");
  has("route_failed", "requestId=2");
  has("reroute_refused", "Cooldown");
  has("route_commit", "Generation 2");
  has("dropped_stale", "stale_generation");
  has("state:routeGeneration", "1 → 2");
  // Zeitstempel je Wechsel vorhanden
  assert(res.timeline.every((e) => typeof e.tMs === "number" && /^\d\d:\d\d:\d\d\.\d{3}$/.test(e.clock)), "Zeitstempel je Eintrag");
  // Tick-Felder
  const t = res.ticks[res.ticks.length - 1];
  for (const k of ["gpsState", "headingState", "heading", "displayLat", "displayLon", "snapped", "distToRouteM", "offRouteConfirmed", "routeGeneration", "rerouteInFlight"]) assert(k in t, `Tick-Feld ${k}`);
  eq(res.warnings.some((w) => /Geometrie/.test(w)), false, "keine Geometrie-Warnung mit vollständiger Route");
}

// 3) Determinismus
{
  const again = replayNavDiagText(logText, { route: bundle });
  eq(JSON.stringify(again), JSON.stringify(res), "gleiches Log → gleiches Ergebnis");
  eq(formatReport(again, { ticks: true }), formatReport(res, { ticks: true }), "Textreport deterministisch");
  const crlf = replayNavDiagText(logText.replace(/\n/g, "\r\n"), { route: bundle });
  eq(JSON.stringify(crlf.summary), JSON.stringify(res.summary), "CRLF-Eingabe gleiche Summary");
}

// 4) ohne Route: läuft, warnt, keine Route-Abstände
{
  const r = replayNavDiagText(logText, {});
  assert(r.warnings.some((w) => /Keine Route/.test(w)), "Warnung ohne Route");
  eq(r.summary.ticksReplayed, 66, "Ticks ohne Route");
  assert(r.ticks.every((t) => t.distToRouteM === null), "ohne Route kein Abstand");
  eq(r.summary.offRouteEpisodes, 0, "ohne Route keine Off-Route");
  assert(r.summary.offRouteEpisodesInLog === 1, "Log-Episode trotzdem gezählt");
}

// 5) Slot-Freigabe bei dropped_stale (aktueller Code) vs. Altverhalten
{
  const gps = (sec, lat, lon) => `14:00:${String(sec).padStart(2, "0")}.000 gps_tick ${JSON.stringify({ rawGps: { lat, lon, speed: 10, course: 0 }, heading: 0, forwardDistM: null, confirmedOffRoute: false, guidanceStale: false, rerouteInFlight: false })}`;
  const small = [
    gps(1, 48.74, 9.31),
    `14:00:02.000 reroute_request_start ${JSON.stringify({ reason: "reroute", from: { lat: 48.74, lon: 9.31 } })}`,
    `14:00:03.000 route_commit ${JSON.stringify({ sessionId: 1, requestId: 5, reason: "off_route", routeGenerationStart: 0, routeGenerationCurrent: 1, result: "dropped_stale", dropReason: "stale_generation" })}`,
    `14:00:08.000 reroute_request_start ${JSON.stringify({ reason: "reroute", from: { lat: 48.74, lon: 9.31 } })}`,
  ].join("\n");
  const fresh = replayNavDiagText(small, { dropReleasesSlot: true });
  eq(fresh.summary.reroutesStarted, 2, "Slot nach dropped_stale frei → 2. Start akzeptiert");
  eq(fresh.summary.reroutesRefused, 0, "nichts abgelehnt");
  eq(fresh.summary.staleResponses, 1, "stale gezählt");
  const legacy = replayNavDiagText(small, { dropReleasesSlot: false });
  eq(legacy.summary.reroutesStarted, 1, "Altverhalten: Slot bleibt blockiert");
  eq(legacy.summary.reroutesRefused, 1, "Altverhalten: 2. Start abgelehnt (inFlight)");
}

// 6) Parser-Toleranz
{
  const mixed = [
    "[NavDiag] transcript platform=android lines=5 at=2026-09-19T23:59:00.000Z",
    "(prev) 10:00:00.000 gps_tick {\"rawGps\":{\"lat\":48.7,\"lon\":9.3,\"speed\":5,\"course\":90}}",
    "Müll ohne JSON",
    "23:59:58.500 gps_tick {\"rawGps\":{\"lat\":48.7,\"lon\":9.3,\"speed\":5,\"course\":90}}",
    "00:00:01.250 gps_tick {\"rawGps\":{\"lat\":48.7001,\"lon\":9.3,\"speed\":5,\"course\":90}}",
    "09-19 00:00:02.000 I/ReactNativeJS: [NavDiag] heartbeat {\"sessionAgeMs\":1}",
    "00:00:03.000 gps_tick {kaputt",
    "[NavDiag] gps_tick {\"a\":1}",
  ].join("\n");
  const p = parseNavDiagLog(mixed);
  eq(p.header.platform, "android", "Header android");
  eq(p.events.length, 4, "gültige Events");
  assert(p.events[0].prevSession && !p.events[1].prevSession, "(prev)-Markierung");
  assert(p.events[2].tMs > p.events[1].tMs && p.events[2].tMs - p.events[1].tMs === 2750, "Tageswechsel 23:59:58.500 → 00:00:01.250 = +2750 ms");
  eq(p.events[3].kind, "heartbeat", "logcat-Prefix erkannt");
  const reasons = p.skipped.map((s) => s.reason).sort().join(",");
  eq(reasons, "bad_json,no_json,no_timestamp", "Skip-Gründe");
}

// 7) Isolation: kein App-Code importiert das Werkzeug
{
  const root = join(here, "..", "..");
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (["node_modules", "dist", ".expo", "navDiagReplay"].includes(name) || name.startsWith("_backup")) continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(tsx?|jsx?|mjs|cjs|json)$/.test(name) && readFileSync(p, "utf8").includes("navDiagReplay")) offenders.push(p.replace(root, ""));
    }
  };
  walk(root);
  eq(offenders.join(","), "", "kein App-/Config-Code referenziert navDiagReplay");
}

console.log("navDiagReplay.selftest: OK");
