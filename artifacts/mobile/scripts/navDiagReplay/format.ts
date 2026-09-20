/**
 * Textausgabe für den NavDiag-Replay (rein, deterministisch, kein Node-Zugriff).
 */
import type { ReplayResult, ReplaySummary, TickRecord } from "./replay";

const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));
const padL = (s: string, n: number) => (s.length >= n ? s : " ".repeat(n - s.length) + s);
const v = (x: unknown) => (x === null || x === undefined ? "–" : String(x));

export function formatTimeline(res: ReplayResult): string {
  const lines: string[] = [];
  lines.push("Zeit(rel)  Uhrzeit       Quelle  Ereignis                Detail");
  for (const e of res.timeline) {
    lines.push(`${padL(`+${e.tRelS.toFixed(2)}s`, 9)}  ${e.clock}  ${pad(e.src, 6)}  ${pad(e.type, 22)}  ${e.detail}`);
  }
  return lines.join("\n");
}

export function formatTicks(ticks: TickRecord[]): string {
  const head = [
    "t(rel)", "gps", "headingState", "hdg", "snap", "display(lat,lon)", "distRoute", "prog", "offRoute", "stale", "gen", "inFlight", "Δhdg", "ΔdistR",
  ];
  const rows = ticks.map((t) => [
    `+${t.tRelS.toFixed(2)}`,
    t.gpsState,
    t.headingState,
    v(t.heading),
    t.snapped ? "ja" : "nein",
    t.displayLat === null ? "–" : `${t.displayLat.toFixed(6)},${t.displayLon!.toFixed(6)}`,
    v(t.distToRouteM),
    String(t.progressM),
    t.offRouteConfirmed ? "JA" : "nein",
    t.guidanceStale ? "ja" : "nein",
    String(t.routeGeneration),
    t.rerouteInFlight ? "ja" : "nein",
    v(t.parity.headingDeltaDeg),
    v(t.parity.distToRouteDeltaM),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (cols: string[]) => cols.map((c, i) => pad(c, widths[i]!)).join("  ");
  return [line(head), ...rows.map(line)].join("\n");
}

const ms = (x: number | null) => (x === null ? "–" : `${(x / 1000).toFixed(2)} s`);

export function formatSummary(s: ReplaySummary): string {
  const byReason = (o: Record<string, number>) => {
    const k = Object.keys(o).sort();
    return k.length ? ` (${k.map((x) => `${x}: ${o[x]}`).join(", ")})` : "";
  };
  const p = s.parity;
  return [
    "── Zusammenfassung ──",
    `Events: ${s.eventsParsed} gelesen, ${s.linesSkipped} Zeilen übersprungen · ${s.ticksReplayed} GPS-Ticks · Dauer ${s.durationS} s · Tick-Abstand median ${v(s.medianTickIntervalS)} s`,
    `Off-Route-Episoden:        ${s.offRouteEpisodes} (Replay) / ${s.offRouteEpisodesInLog} (im Log aufgezeichnet)`,
    `Reroutes gestartet:        ${s.reroutesStarted}${byReason(s.reroutesStartedByReason)} · vom Engine abgelehnt: ${s.reroutesRefused} · im Log blockiert (inflight/cooldown): ${s.rerouteBlockedInLog}`,
    `Timeouts:                  ${s.timeouts}`,
    `Reroute fehlgeschlagen:    ${s.failed}`,
    `Commits (erfolgreich, inkl. initial): ${s.committed} · finale routeGeneration ${s.finalRouteGeneration}`,
    `Stale Responses:           ${s.staleResponses}${byReason(s.staleByReason)}`,
    `Längste Zeit bis erfolgreicher Reroute:`,
    `   Anfrage → Commit:       ${ms(s.longestRequestToCommitMs)}`,
    `   Off-Route erkannt → Commit: ${ms(s.longestOffRouteToCommitMs)}`,
    `Parität Replay ↔ App-Log (${p.ticksCompared} Ticks): Heading max ${v(p.headingMaxAbsDeltaDeg)}° / mittel ${v(p.headingMeanAbsDeltaDeg)}°, Abstand-zur-Route max ${v(p.distToRouteMaxAbsDeltaM)} m, Off-Route-Abweichungen ${p.offRouteMismatches}, stale-Abweichungen ${p.staleMismatches}, Generation-Abweichungen ${p.generationMismatches}`,
  ].join("\n");
}

export function formatReport(res: ReplayResult, opts: { ticks?: boolean } = {}): string {
  const out: string[] = [];
  const h = res.header;
  out.push(`NavDiag-Replay${h ? ` · platform=${v(h.platform)} · Log erzeugt ${v(h.at)}` : ""}`);
  out.push("");
  out.push("── Zustandswechsel & Ereignisse ──");
  out.push(formatTimeline(res));
  if (opts.ticks) {
    out.push("");
    out.push("── Ticks ──");
    out.push(formatTicks(res.ticks));
  }
  out.push("");
  out.push(formatSummary(res.summary));
  if (res.warnings.length) {
    out.push("");
    out.push("── Hinweise ──");
    for (const w of res.warnings) out.push(`• ${w}`);
  }
  return out.join("\n");
}
