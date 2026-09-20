#!/usr/bin/env node
/**
 * NavDiag-Log-Replay (Diagnose-CLI, NICHT Teil des App-Bundles).
 *
 * Nutzung (aus artifacts/mobile):
 *   npx tsx scripts/navDiagReplay/cli.mjs <navdiag.txt|.log> [--route route.json] [--ticks] [--json] [--out datei]
 *                                         [--legacy-drop] [--timeout-ms 12000]
 *
 *   <navdiag.txt|.log>   Transcript aus dem In-App-Overlay (Zeilen "HH:MM:SS.mmm kind {json}").
 *   --route         Routen-Geometrie (das Log enthält keine): nav-route-Antwort {polyline:[[lat,lon]…],steps,distanceKm,durationMinutes}
 *                   oder Bundle {"initial": <route>, "reroutes": [<route>, …]} (Reroute-Geometrien in Commit-Reihenfolge).
 *   --ticks         zusätzlich Tabelle je GPS-Tick (gpsState, headingState, display, Abstand, …).
 *   --json          maschinenlesbare Ausgabe (deterministisch).
 *   --legacy-drop   verworfene Responses geben den Request-Slot NICHT frei (Verhalten vor Commit 7ef53a2e).
 *   --timeout-ms    ab dieser Dauer zählt reroute_request_done ok=false als Timeout (Standard 12000).
 *
 * Exit-Code 0 = Replay gelaufen, 2 = Eingabefehler.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { replayNavDiagText, normalizeRouteBundle } from "./replay.ts";
import { formatReport } from "./format.ts";

function usage(code) {
  const msg = readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n/, "").replace(/^\/\*\*?\n?/, "").replace(/^ \* ?/gm, "");
  (code === 0 ? console.log : console.error)(msg.trim());
  process.exit(code);
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) usage(args.length === 0 ? 2 : 0);

const opt = { route: null, ticks: false, json: false, out: null, legacyDrop: false, timeoutMs: 12000, log: null };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--route") opt.route = args[++i];
  else if (a === "--out") opt.out = args[++i];
  else if (a === "--timeout-ms") opt.timeoutMs = Number(args[++i]);
  else if (a === "--ticks") opt.ticks = true;
  else if (a === "--json") opt.json = true;
  else if (a === "--legacy-drop") opt.legacyDrop = true;
  else if (a.startsWith("--")) { console.error(`Unbekannte Option ${a}`); usage(2); }
  else opt.log = a;
}
if (!opt.log) usage(2);

let text;
try { text = readFileSync(opt.log, "utf8"); } catch (e) { console.error(`Log nicht lesbar: ${opt.log} (${e.message})`); process.exit(2); }
let bundle = null;
if (opt.route) {
  try { bundle = normalizeRouteBundle(JSON.parse(readFileSync(opt.route, "utf8"))); }
  catch (e) { console.error(`Route nicht lesbar: ${opt.route} (${e.message})`); process.exit(2); }
  if (!bundle.initial) { console.error("Route-Datei enthält keine gültige Polyline (initial)."); process.exit(2); }
}

const res = replayNavDiagText(text, { route: bundle, dropReleasesSlot: !opt.legacyDrop, timeoutThresholdMs: opt.timeoutMs });
const out = opt.json
  ? JSON.stringify({ summary: res.summary, warnings: res.warnings, timeline: res.timeline, ticks: opt.ticks ? res.ticks : undefined, skipped: res.skipped }, null, 2)
  : formatReport(res, { ticks: opt.ticks });
if (opt.out) { writeFileSync(opt.out, out + "\n"); console.log(`Report geschrieben: ${opt.out}`); }
else console.log(out);
