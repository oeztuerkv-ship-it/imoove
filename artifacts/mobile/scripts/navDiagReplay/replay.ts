/**
 * NavDiag-Replay (Diagnose-Werkzeug, NICHT Teil des App-Bundles, von der App nirgends importiert).
 *
 * Spielt aufgezeichnete `[NavDiag]`-Events offline durch die PRODUKTIVEN Engines:
 *   utils/navEngine/NavigationEngine.tickNavEngine / commitNavigationRoute
 *   utils/navEngine/RerouteEngine (beginRouteRequest / completeReroute / failReroute / …)
 *   utils/navEngine/navLifecycle.classifyGpsLifecycle
 * Es ändert keine Engine-Logik und keine Schwellenwerte.
 *
 * Ablauf = navigation.tsx nachgestellt, Zustandswechsel folgen dem LOG:
 *  - gps_tick            → tickNavEngine mit rawGps (lat/lon/speed/course) und Log-Zeitstempel als nowMs
 *  - reroute_request_start → beginRouteRequest (+ rerouteInFlight)
 *  - route_commit        → committed: commitNavigationRoute + completeReroute
 *                          failed: failReroute · dropped_stale: Slot freigeben (Option) — nur Logging der Drop-Reason
 *  - reroute_request_done / reroute_decision → Metriken (Timeout wird aus elapsedMs/error abgeleitet)
 *  - session_reset / gps_watch_mount → frische Engine, gps_watch_unmount → alle Requests ungültig
 *
 * Grenzen (im Report als Warnungen sichtbar):
 *  - Das Log enthält KEINE Routen-Geometrie → Route per Option nötig, sonst kein Abstand zur Route/Off-Route.
 *  - gps_tick wird ~1/s geloggt (Off-Route/stale immer) → Engine sieht weniger Fixes als die App (Position-EMA weicht leicht ab).
 *  - Accuracy wird nicht geloggt.
 * Deterministisch: keine Uhr, kein Zufall — gleiches Log + gleiche Optionen → gleiches Ergebnis.
 */

import {
  commitNavigationRoute,
  createNavEngineState,
  setNavEngineRerouteInFlight,
  tickNavEngine,
} from "../../utils/navEngine/NavigationEngine";
import {
  beginRouteRequest,
  completeReroute,
  createRerouteEngineState,
  failReroute,
  invalidateAllRouteRequests,
  isRerouteInFlight,
  releaseRouteRequestIfActive,
} from "../../utils/navEngine/RerouteEngine";
import type { NavRouteRequestReason, RerouteEngineState } from "../../utils/navEngine/RerouteEngine";
import { classifyGpsLifecycle } from "../../utils/navEngine/navLifecycle";
import { shortestRotationDelta } from "../../utils/liveDriverMarkerMotion";
import type { LatLon, NavEngineState, NavRouteSnapshot, NavRouteStep } from "../../utils/navEngine/types";
import { parseNavDiagLog } from "./parseNavDiag";
import type { NavDiagEvent, NavDiagParseResult } from "./parseNavDiag";

// ───────────────────────── Route-Eingabe ─────────────────────────

export type ReplayRoute = {
  polyline: LatLon[];
  steps: NavRouteStep[];
  authoritativeDistM: number;
  authoritativeEtaMin: number;
};

export type ReplayRouteBundle = {
  /** Route der ersten Bindung (Generation 1) bzw. des `initial`-Commits. */
  initial: ReplayRoute | null;
  /** Geometrien der folgenden erfolgreichen Reroute-Commits, in Reihenfolge. */
  reroutes: ReplayRoute[];
};

function pathLengthM(p: LatLon[]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += haversineM(p[i - 1]!, p[i]!);
  return s;
}

export function haversineM(a: LatLon, b: LatLon): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Akzeptiert die nav-route-API-Antwort ({polyline:[[lat,lon]], distanceKm, …}) oder Engine-Form ({polyline:[{lat,lon}]}). */
export function normalizeReplayRoute(raw: unknown): ReplayRoute | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const pl = o.polyline;
  if (!Array.isArray(pl) || pl.length < 2) return null;
  const polyline: LatLon[] = [];
  for (const p of pl) {
    if (Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number") {
      polyline.push({ lat: p[0], lon: p[1] });
    } else if (p && typeof p === "object" && typeof (p as LatLon).lat === "number" && typeof (p as LatLon).lon === "number") {
      polyline.push({ lat: (p as LatLon).lat, lon: (p as LatLon).lon });
    } else return null;
  }
  const stepsRaw = Array.isArray(o.steps) ? (o.steps as Record<string, unknown>[]) : [];
  const steps: NavRouteStep[] = stepsRaw.map((s) => ({
    instruction: typeof s.instruction === "string" ? s.instruction : "",
    ...(typeof s.maneuver === "string" && s.maneuver ? { maneuver: s.maneuver } : {}),
    roadName: typeof s.roadName === "string" ? s.roadName : null,
    distanceM: Math.max(0, Math.round(Number(s.distanceM ?? 0))),
    lat: Number(s.lat ?? 0),
    lon: Number(s.lon ?? 0),
  }));
  const distM =
    typeof o.authoritativeDistM === "number"
      ? o.authoritativeDistM
      : typeof o.distanceKm === "number"
        ? o.distanceKm * 1000
        : pathLengthM(polyline);
  const eta =
    typeof o.authoritativeEtaMin === "number"
      ? o.authoritativeEtaMin
      : typeof o.durationMinutes === "number"
        ? o.durationMinutes
        : Math.max(1, Math.round(distM / 13.9 / 60));
  return { polyline, steps, authoritativeDistM: distM, authoritativeEtaMin: eta };
}

/** Einzelne Route → initial; Objekt {initial, reroutes[]} → Bundle. */
export function normalizeRouteBundle(raw: unknown): ReplayRouteBundle {
  if (raw && typeof raw === "object" && ("initial" in (raw as object) || "reroutes" in (raw as object))) {
    const o = raw as { initial?: unknown; reroutes?: unknown };
    return {
      initial: normalizeReplayRoute(o.initial),
      reroutes: (Array.isArray(o.reroutes) ? o.reroutes : []).map(normalizeReplayRoute).filter((r): r is ReplayRoute => r != null),
    };
  }
  return { initial: normalizeReplayRoute(raw), reroutes: [] };
}

// ───────────────────────── Ergebnis-Typen ─────────────────────────

export type ReplayOptions = {
  route?: ReplayRouteBundle | null;
  /** true = aktueller Code (verworfene Response gibt den Slot frei). false = Stand vor 7ef53a2e (Slot bleibt blockiert). */
  dropReleasesSlot?: boolean;
  /** Ab dieser Dauer gilt `reroute_request_done ok=false` als Timeout (App-Timeout = 12 s). */
  timeoutThresholdMs?: number;
  sessionId?: number;
};

export type TimelineEntry = {
  tMs: number;
  /** Sekunden seit dem ersten Event. */
  tRelS: number;
  clock: string;
  src: "replay" | "log";
  type: string;
  detail: string;
};

export type TickRecord = {
  tMs: number;
  tRelS: number;
  clock: string;
  lat: number;
  lon: number;
  speedMps: number | null;
  courseDeg: number | null;
  gpsState: string;
  headingState: string;
  heading: number | null;
  headingReason: string;
  displayLat: number | null;
  displayLon: number | null;
  snapped: boolean;
  distToRouteM: number | null;
  progressM: number;
  offRouteConfirmed: boolean;
  guidanceStale: boolean;
  routeGeneration: number;
  rerouteInFlight: boolean;
  hasRoute: boolean;
  /** Abweichung gegenüber den im Log aufgezeichneten App-Werten (null = im Log nicht vorhanden). */
  parity: {
    headingDeltaDeg: number | null;
    distToRouteDeltaM: number | null;
    displayDeltaM: number | null;
    offRouteMismatch: boolean | null;
    staleMismatch: boolean | null;
  };
};

export type ReplaySummary = {
  eventsParsed: number;
  linesSkipped: number;
  ticksReplayed: number;
  durationS: number;
  medianTickIntervalS: number | null;
  offRouteEpisodes: number;
  offRouteEpisodesInLog: number;
  reroutesStarted: number;
  reroutesStartedByReason: Record<string, number>;
  reroutesRefused: number;
  rerouteBlockedInLog: number;
  timeouts: number;
  failed: number;
  committed: number;
  staleResponses: number;
  staleByReason: Record<string, number>;
  /** Anfrage-Start → erfolgreicher Commit (nur Requests mit reason ≠ initial). */
  longestRequestToCommitMs: number | null;
  /** Erste Off-Route-Bestätigung der Episode → erfolgreicher Commit. */
  longestOffRouteToCommitMs: number | null;
  finalRouteGeneration: number;
  parity: {
    ticksCompared: number;
    headingMaxAbsDeltaDeg: number | null;
    headingMeanAbsDeltaDeg: number | null;
    distToRouteMaxAbsDeltaM: number | null;
    offRouteMismatches: number;
    staleMismatches: number;
    generationMismatches: number;
  };
};

export type ReplayResult = {
  timeline: TimelineEntry[];
  ticks: TickRecord[];
  summary: ReplaySummary;
  warnings: string[];
  header: NavDiagParseResult["header"];
};

// ───────────────────────── Hilfen ─────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const fmt = (v: unknown) => (v === null || v === undefined ? "–" : typeof v === "number" ? String(r2(v)) : String(v));

function mapReason(r: string | null): NavRouteRequestReason {
  if (r === "initial" || r === "recover" || r === "recenter") return r;
  return "off_route"; // "reroute" | "off_route" | unbekannt
}

type OpenRequest = {
  /** Request-Id der produktiven RerouteEngine (beginRouteRequest). */
  engineRequestId: number;
  appRequestId: number | null;
  startMs: number;
  reason: NavRouteRequestReason;
  expectedCommitGeneration: number;
  synthetic: boolean;
  doneElapsedMs: number | null;
};

// ───────────────────────── Replay ─────────────────────────

export function replayNavDiag(events: NavDiagEvent[], parsed: Pick<NavDiagParseResult, "header" | "skipped">, opts: ReplayOptions = {}): ReplayResult {
  const dropReleasesSlot = opts.dropReleasesSlot ?? true;
  const timeoutThresholdMs = opts.timeoutThresholdMs ?? 12_000;
  const sessionId = opts.sessionId ?? 1;
  const bundle = opts.route ?? null;

  const warnings: string[] = [];
  const timeline: TimelineEntry[] = [];
  const ticks: TickRecord[] = [];
  const t0 = events.length ? events[0]!.tMs : 0;

  const push = (tMs: number, clock: string, src: "replay" | "log", type: string, detail: string) =>
    timeline.push({ tMs, tRelS: r2((tMs - t0) / 1000), clock, src, type, detail });

  const clockOf = (tMs: number) => {
    const d = ((tMs % 86_400_000) + 86_400_000) % 86_400_000;
    const p = (n: number, w = 2) => String(n).padStart(w, "0");
    return `${p(Math.floor(d / 3_600_000))}:${p(Math.floor((d % 3_600_000) / 60_000))}:${p(Math.floor((d % 60_000) / 1000))}.${p(d % 1000, 3)}`;
  };

  // Initial-Route: gibt der Log einen initial-Commit her, wird dort gebunden; sonst vor dem ersten Tick.
  const logHasInitialCommit = events.some(
    (e) => e.kind === "route_commit" && str(e.data.reason) === "initial" && str(e.data.result) === "committed",
  );
  const hasAnyRouteEvent = events.some((e) => e.kind === "route_commit" || e.kind === "reroute_request_start");
  if (!bundle?.initial) {
    warnings.push("Keine Route übergeben (--route): Abstand zur Route, Off-Route und Fortschritt können nicht berechnet werden.");
  }
  if (!hasAnyRouteEvent) {
    warnings.push("Log enthält keine reroute_request_start/route_commit-Events: Reroute-/Generation-Verlauf ist nicht rekonstruierbar.");
  }

  let st: NavEngineState = createNavEngineState(sessionId);
  let rr: RerouteEngineState = createRerouteEngineState(sessionId);
  let rerouteRouteIdx = 0;
  let routeBound = false;
  let firstTickSeen = false;
  const open: OpenRequest[] = [];

  // beobachtete Zustände für Wechsel-Timeline
  const seen: Record<string, string | number | boolean | null> = {
    gpsState: null,
    headingState: null,
    snapped: null,
    offRoute: null,
    stale: null,
    inFlight: null,
    generation: null,
    routeState: null,
  };
  const change = (key: string, value: string | number | boolean, tMs: number, clock: string, label: string, detail: string) => {
    if (seen[key] === value) return;
    const prev = seen[key];
    seen[key] = value;
    push(tMs, clock, "replay", `state:${label}`, `${prev === null ? "–" : fmt(prev)} → ${fmt(value)}${detail ? `  (${detail})` : ""}`);
  };

  // Summary-Zähler
  // Eine Off-Route-Episode = erste Bestätigung bis (erfolgreicher Commit | wieder auf Route ohne stale/inFlight).
  // Während eines laufenden Reroutes ist confirmedOffRoute engine-bedingt false — das beendet die Episode NICHT.
  let offRouteEpisodes = 0;
  let offRouteEpisodesInLog = 0;
  let episodeOpen = false;
  let recordedEpisodeOpen = false;
  let reroutesStarted = 0;
  const startedByReason: Record<string, number> = {};
  let reroutesRefused = 0;
  let blockedInLog = 0;
  let timeouts = 0;
  let failed = 0;
  let committed = 0;
  let stale = 0;
  const staleByReason: Record<string, number> = {};
  let longestReq: number | null = null;
  let longestOff: number | null = null;
  let offEpisodeStartMs: number | null = null;
  let geometryMissing = 0;
  let geometryReused = 0;
  let lastFixAt: number | null = null;
  const tickTimes: number[] = [];
  const par = { n: 0, hMax: 0, hSum: 0, hN: 0, dMax: 0, dN: 0, off: 0, stale: 0, gen: 0 };

  const bindRoute = (route: ReplayRoute, generation: number, at: LatLon) => {
    const c = commitNavigationRoute(st, {
      polyline: route.polyline,
      steps: route.steps,
      authoritativeDistM: route.authoritativeDistM,
      authoritativeEtaMin: route.authoritativeEtaMin,
      at,
      generation,
    });
    if (!c) return false;
    st = c.state;
    routeBound = true;
    return true;
  };

  const lastPos = (): LatLon | null => st.runtime.displayPosition ?? st.runtime.rawPosition;

  const resetEngine = (tMs: number, clock: string, why: string) => {
    st = createNavEngineState(sessionId);
    rr = createRerouteEngineState(sessionId);
    open.length = 0;
    routeBound = false;
    firstTickSeen = false;
    lastFixAt = null;
    offEpisodeStartMs = null;
    for (const k of Object.keys(seen)) seen[k] = null;
    push(tMs, clock, "replay", "session_reset", why);
  };

  for (const ev of events) {
    const { tMs, clock } = ev;

    switch (ev.kind) {
      case "session_reset":
      case "gps_watch_mount": {
        push(tMs, clock, "log", ev.kind, str(ev.data.reason) ?? "");
        if (ev.kind === "session_reset" || firstTickSeen) resetEngine(tMs, clock, `Engine zurückgesetzt (${ev.kind})`);
        break;
      }
      case "gps_watch_unmount": {
        push(tMs, clock, "log", ev.kind, "");
        rr = invalidateAllRouteRequests(rr);
        st = setNavEngineRerouteInFlight(st, false);
        open.length = 0;
        break;
      }
      case "gps_tick": {
        const raw = obj(ev.data.rawGps);
        const lat = num(raw?.lat);
        const lon = num(raw?.lon);
        if (lat === null || lon === null) {
          warnings.push(`gps_tick Zeile ${ev.line}: rawGps.lat/lon fehlen — übersprungen.`);
          break;
        }

        // GPS-Lifecycle zwischen zwei Fixes (App: 1-s-Intervall auf classifyGpsLifecycle)
        if (lastFixAt !== null) {
          for (let tt = lastFixAt + 1000; tt < tMs; tt += 1000) {
            const g = classifyGpsLifecycle({ lastFixAt, nowMs: tt, resyncing: false });
            change("gpsState", g, tt, clockOf(tt), "gpsState", `kein Fix seit ${Math.round((tt - lastFixAt) / 1000)} s`);
          }
        }

        if (!routeBound && bundle?.initial && !logHasInitialCommit) {
          if (bindRoute(bundle.initial, 1, { lat, lon })) {
            push(tMs, clock, "replay", "route_bound", "initial (Option --route), Generation 1 — kein initial-Commit im Log");
          }
        }
        firstTickSeen = true;

        const fix = {
          lat,
          lon,
          speedMps: num(raw?.speed),
          courseDeg: num(raw?.course),
          nowMs: tMs,
        };
        const tick = tickNavEngine(st, fix, undefined, { sessionId });
        st = tick.state;
        const nav = tick.navigation;
        lastFixAt = tMs;
        tickTimes.push(tMs);

        // Zustandswechsel
        change("gpsState", nav.gpsState, tMs, clock, "gpsState", "");
        change(
          "headingState",
          nav.headingState,
          tMs,
          clock,
          "headingState",
          `heading=${fmt(nav.heading)}° reason=${nav.headingReason} speed=${fmt(nav.speed)}`,
        );
        change("snapped", nav.isSnapped, tMs, clock, "snapped", nav.isSnapped ? "Marker auf Route gesnappt" : "Marker auf GPS/gefiltert");
        const off = nav.confirmedOffRoute;
        if (off && !episodeOpen) {
          offRouteEpisodes += 1;
          episodeOpen = true;
          offEpisodeStartMs = tMs;
        } else if (!off && !st.rerouteInFlight && !nav.guidanceStale) {
          episodeOpen = false;
          offEpisodeStartMs = null;
        }
        change("offRoute", off, tMs, clock, "offRoute", off ? `Abstand zur Rest-Route ${fmt(tick.diag.forwardDistM)} m` : "");
        change("stale", nav.guidanceStale, tMs, clock, "guidanceStale", "");
        change("inFlight", st.rerouteInFlight, tMs, clock, "rerouteInFlight", "");
        change("generation", st.routeGeneration, tMs, clock, "routeGeneration", "");
        change("routeState", nav.routeState, tMs, clock, "routeState", "");

        // Parität gegen aufgezeichnete App-Werte
        const recHeading = num(ev.data.heading);
        const recDist = num(ev.data.forwardDistM);
        const recDisplay = obj(ev.data.display);
        const recOff = bool(ev.data.confirmedOffRoute);
        const recStale = bool(ev.data.guidanceStale);
        if (recOff === true && !recordedEpisodeOpen) {
          offRouteEpisodesInLog += 1;
          recordedEpisodeOpen = true;
        } else if (recOff === false && bool(ev.data.rerouteInFlight) === false && recStale === false) {
          recordedEpisodeOpen = false;
        }
        const dispLat = nav.displayPosition?.lat ?? null;
        const dispLon = nav.displayPosition?.lon ?? null;
        const pHead =
          recHeading !== null && nav.heading !== null ? Math.abs(shortestRotationDelta(recHeading, nav.heading)) : null;
        const fDist = tick.diag.forwardDistM;
        const pDist = recDist !== null && fDist !== null ? Math.abs(recDist - fDist) : null;
        const rdLat = num(recDisplay?.lat);
        const rdLon = num(recDisplay?.lon);
        const pDisp =
          rdLat !== null && rdLon !== null && dispLat !== null && dispLon !== null
            ? haversineM({ lat: rdLat, lon: rdLon }, { lat: dispLat, lon: dispLon })
            : null;
        par.n += 1;
        if (pHead !== null) {
          par.hMax = Math.max(par.hMax, pHead);
          par.hSum += pHead;
          par.hN += 1;
        }
        if (pDist !== null) {
          par.dMax = Math.max(par.dMax, pDist);
          par.dN += 1;
        }
        const offMis = recOff === null ? null : recOff !== off;
        const staleMis = recStale === null ? null : recStale !== nav.guidanceStale;
        if (offMis) par.off += 1;
        if (staleMis) par.stale += 1;

        ticks.push({
          tMs,
          tRelS: r2((tMs - t0) / 1000),
          clock,
          lat: r6(lat),
          lon: r6(lon),
          speedMps: fix.speedMps === null ? null : r2(fix.speedMps),
          courseDeg: fix.courseDeg === null ? null : r2(fix.courseDeg),
          gpsState: nav.gpsState,
          headingState: nav.headingState,
          heading: nav.heading === null ? null : r2(nav.heading),
          headingReason: nav.headingReason,
          displayLat: dispLat === null ? null : r6(dispLat),
          displayLon: dispLon === null ? null : r6(dispLon),
          snapped: nav.isSnapped,
          distToRouteM: fDist === null ? null : r2(fDist),
          progressM: r2(nav.routeProgress),
          offRouteConfirmed: off,
          guidanceStale: nav.guidanceStale,
          routeGeneration: st.routeGeneration,
          rerouteInFlight: st.rerouteInFlight,
          hasRoute: st.boundRoute !== null,
          parity: {
            headingDeltaDeg: pHead === null ? null : r2(pHead),
            distToRouteDeltaM: pDist === null ? null : r2(pDist),
            displayDeltaM: pDisp === null ? null : r2(pDisp),
            offRouteMismatch: offMis,
            staleMismatch: staleMis,
          },
        });
        break;
      }
      case "reroute_decision": {
        const reason = str(ev.data.reason) ?? "?";
        const will = bool(ev.data.willRequest);
        if (reason === "blocked_inflight" || reason === "blocked_cooldown") blockedInLog += 1;
        push(
          tMs,
          clock,
          "log",
          will ? "reroute_decision" : "reroute_blocked",
          `reason=${reason} willRequest=${fmt(will)} inFlight=${fmt(bool(ev.data.inFlight))} forwardDistM=${fmt(num(ev.data.forwardDistM))}`,
        );
        break;
      }
      case "reroute_request_start": {
        const reasonRaw = str(ev.data.reason);
        const reason = mapReason(reasonRaw);
        const cooldownMs = reason === "initial" ? 0 : reason === "recover" && !routeBound ? 8_000 : undefined;
        const begun = beginRouteRequest(rr, {
          nowMs: tMs,
          currentBoundGeneration: st.routeGeneration,
          navigationSessionId: sessionId,
          reason,
          cooldownMs,
        });
        if (!begun) {
          reroutesRefused += 1;
          push(
            tMs,
            clock,
            "replay",
            "reroute_refused",
            `Request (${reasonRaw}) vom Gate abgelehnt (${isRerouteInFlight(rr) ? "bereits inFlight" : "Cooldown"}) — die App loggt den Start vor dem Gate`,
          );
          break;
        }
        rr = begun.state;
        st = setNavEngineRerouteInFlight(st, true);
        reroutesStarted += 1;
        startedByReason[reasonRaw ?? "?"] = (startedByReason[reasonRaw ?? "?"] ?? 0) + 1;
        open.push({
          engineRequestId: begun.requestId,
          appRequestId: null,
          startMs: tMs,
          reason,
          expectedCommitGeneration: begun.request.expectedCommitGeneration,
          synthetic: false,
          doneElapsedMs: null,
        });
        push(
          tMs,
          clock,
          "replay",
          "reroute_started",
          `reason=${reasonRaw} → engineRequest#${begun.requestId} gen ${begun.request.routeGenerationAtStart}→${begun.request.expectedCommitGeneration}` +
            (begun.supersededRequestId != null ? ` (ersetzt #${begun.supersededRequestId})` : ""),
        );
        // In-flight-Wechsel wird beim nächsten Tick als State-Change sichtbar; hier direkt festhalten:
        change("inFlight", true, tMs, clock, "rerouteInFlight", "");
        change("stale", true, tMs, clock, "guidanceStale", "Reroute läuft");
        break;
      }
      case "reroute_request_done": {
        const ok = bool(ev.data.ok);
        const elapsed = num(ev.data.elapsedMs);
        const err = str(ev.data.error);
        const isTimeout =
          ok === false && ((err !== null && /timeout|abort/i.test(err)) || (elapsed !== null && elapsed >= timeoutThresholdMs));
        if (isTimeout) timeouts += 1;
        // Dauer dem passenden offenen/letzten Request zuordnen (Anzeige)
        const target = [...open].reverse().find((o) => o.doneElapsedMs === null);
        if (target) target.doneElapsedMs = elapsed;
        push(
          tMs,
          clock,
          "log",
          isTimeout ? "reroute_timeout" : "reroute_request_done",
          `reason=${fmt(str(ev.data.reason))} ok=${fmt(ok)} elapsed=${fmt(elapsed)} ms${err ? ` error=${err}` : ""}${isTimeout ? "  → als Timeout gewertet" : ""}`,
        );
        break;
      }
      case "route_commit": {
        const result = str(ev.data.result) ?? "?";
        const reasonRaw = str(ev.data.reason) ?? "?";
        const appReqId = num(ev.data.requestId);
        const dropReason = str(ev.data.dropReason);
        const logGenCur = num(ev.data.routeGenerationCurrent);

        // offenen Request finden: gleiche App-RequestId → sonst ältester ohne Zuordnung → sonst synthetisch
        let req =
          (appReqId !== null ? open.find((o) => o.appRequestId === appReqId) : undefined) ??
          open.find((o) => o.appRequestId === null);
        if (req && req.appRequestId === null && appReqId !== null) req.appRequestId = appReqId;

        if (result === "dropped_stale") {
          stale += 1;
          const key = dropReason ?? "?";
          staleByReason[key] = (staleByReason[key] ?? 0) + 1;
          if (req && dropReleasesSlot) {
            rr = releaseRouteRequestIfActive(rr, req.engineRequestId, tMs);
          }
          if (req) open.splice(open.indexOf(req), 1);
          if (isRerouteInFlight(rr) === false) st = setNavEngineRerouteInFlight(st, false);
          push(
            tMs,
            clock,
            "log",
            "dropped_stale",
            `requestId=${fmt(appReqId)} dropReason=${dropReason ?? "?"} gen ${fmt(num(ev.data.routeGenerationStart))}→${fmt(logGenCur)}` +
              (dropReleasesSlot ? "  (Slot freigegeben)" : "  (Slot bleibt blockiert — Altverhalten)") +
              (req ? "" : "  [kein passender offener Request im Replay]"),
          );
          break;
        }

        if (result === "failed") {
          failed += 1;
          if (req) {
            rr = failReroute(rr, req.engineRequestId, tMs);
            open.splice(open.indexOf(req), 1);
          }
          st = setNavEngineRerouteInFlight(st, isRerouteInFlight(rr));
          push(tMs, clock, "log", "route_failed", `requestId=${fmt(appReqId)} reason=${reasonRaw}${req ? "" : "  [kein passender offener Request im Replay]"}`);
          break;
        }

        if (result === "committed") {
          // Request ggf. synthetisch beginnen (z. B. initial-Route startet ohne reroute_request_start-Log)
          if (!req) {
            const begun = beginRouteRequest(rr, {
              nowMs: tMs,
              currentBoundGeneration: st.routeGeneration,
              navigationSessionId: sessionId,
              reason: mapReason(reasonRaw),
              cooldownMs: 0,
            });
            if (begun) {
              rr = begun.state;
              req = {
                engineRequestId: begun.requestId,
                appRequestId: appReqId,
                startMs: tMs,
                reason: mapReason(reasonRaw),
                expectedCommitGeneration: begun.request.expectedCommitGeneration,
                synthetic: true,
                doneElapsedMs: null,
              };
              open.push(req);
            }
          }
          if (!req) {
            warnings.push(`route_commit Zeile ${ev.line}: kein Request beginnbar — nicht übernommen.`);
            break;
          }
          const activeId = req.engineRequestId;
          const isInitial = !routeBound || reasonRaw === "initial";
          let geo: ReplayRoute | null = null;
          let geoNote = "";
          if (isInitial && bundle?.initial) {
            geo = bundle.initial;
          } else if (!isInitial && rerouteRouteIdx < (bundle?.reroutes.length ?? 0)) {
            geo = bundle!.reroutes[rerouteRouteIdx++]!;
          } else if (st.boundRoute) {
            geo = {
              polyline: st.boundRoute.polyline,
              steps: st.boundRoute.steps,
              authoritativeDistM: st.boundRoute.authoritativeDistM,
              authoritativeEtaMin: st.boundRoute.authoritativeEtaMin,
            };
            geometryReused += 1;
            geoNote = "  ⚠ Geometrie fehlt — vorherige Polyline wiederverwendet (Abstände danach nicht aussagekräftig)";
          }
          if (!geo) {
            geometryMissing += 1;
            rr = failReroute(rr, activeId, tMs);
            st = setNavEngineRerouteInFlight(st, isRerouteInFlight(rr));
            open.splice(open.indexOf(req), 1);
            push(tMs, clock, "replay", "route_commit_skipped", `requestId=${fmt(appReqId)}: keine Routen-Geometrie verfügbar (--route)`);
            break;
          }
          const at = lastPos() ?? geo.polyline[0]!;
          const ok = bindRoute(geo, req.expectedCommitGeneration, at);
          if (!ok) {
            rr = failReroute(rr, activeId, tMs);
            st = setNavEngineRerouteInFlight(st, isRerouteInFlight(rr));
            open.splice(open.indexOf(req), 1);
            push(tMs, clock, "replay", "route_commit_rejected", `requestId=${fmt(appReqId)}: Polyline nicht commitbar`);
            break;
          }
          rr = completeReroute(rr, activeId, tMs);
          st = setNavEngineRerouteInFlight(st, false);
          open.splice(open.indexOf(req), 1);
          committed += 1;
          const reqToCommit = tMs - req.startMs;
          if (req.reason !== "initial" && !req.synthetic) longestReq = Math.max(longestReq ?? 0, reqToCommit);
          if (req.reason !== "initial") {
            if (offEpisodeStartMs !== null) longestOff = Math.max(longestOff ?? 0, tMs - offEpisodeStartMs);
            offEpisodeStartMs = null;
            episodeOpen = false;
            recordedEpisodeOpen = false;
          }
          const genMismatch = logGenCur !== null && logGenCur !== st.routeGeneration;
          if (genMismatch) par.gen += 1;
          change("generation", st.routeGeneration, tMs, clock, "routeGeneration", "route_commit");
          change("inFlight", false, tMs, clock, "rerouteInFlight", "");
          push(
            tMs,
            clock,
            "log",
            "route_commit",
            `requestId=${fmt(appReqId)} reason=${reasonRaw} → committed, Generation ${st.routeGeneration}` +
              ` (Log: ${fmt(logGenCur)}${genMismatch ? " ≠ Replay!" : ""})` +
              (req.synthetic ? "" : `, Anfrage→Commit ${Math.round(reqToCommit)} ms`) +
              geoNote,
          );
          break;
        }

        push(tMs, clock, "log", "route_commit", `unbekanntes result=${result}`);
        break;
      }
      case "heading_transition": {
        push(
          tMs,
          clock,
          "log",
          "heading_transition",
          `state=${fmt(str(ev.data.headingState))} reason=${fmt(str(ev.data.reason))} raw=${fmt(num(ev.data.rawHeading))} resolved=${fmt(num(ev.data.resolvedHeading))} speed=${fmt(num(ev.data.speed))}`,
        );
        break;
      }
      default:
        break; // heartbeat, camera, pipeline_owners, buffer_cleared, … nicht relevant
    }
  }

  if (geometryReused > 0) warnings.push(`${geometryReused} Reroute-Commit(s) ohne Routen-Geometrie: vorherige Polyline wiederverwendet — Off-Route-/Abstandswerte danach sind nicht aussagekräftig. Weitere Routen über --route {"initial":…,"reroutes":[…]} liefern.`);
  if (geometryMissing > 0) warnings.push(`${geometryMissing} Commit(s) ohne verfügbare Geometrie übersprungen.`);
  if (parsed.skipped.length > 0) warnings.push(`${parsed.skipped.length} Zeile(n) nicht lesbar (übersprungen).`);
  if (ticks.length > 1) {
    warnings.push("Log enthält ~1 gps_tick/s (gedrosselt): Engine sieht weniger Fixes als die App; kleine Abweichungen bei Position/Heading sind erwartbar.");
  }
  warnings.push("Accuracy wird im NavDiag-Log nicht mitgeschrieben und daher nicht wiederverwendet.");

  const dts: number[] = [];
  for (let i = 1; i < tickTimes.length; i++) dts.push(tickTimes[i]! - tickTimes[i - 1]!);
  dts.sort((a, b) => a - b);
  const medianDt = dts.length ? dts[Math.floor(dts.length / 2)]! / 1000 : null;

  const summary: ReplaySummary = {
    eventsParsed: events.length,
    linesSkipped: parsed.skipped.length,
    ticksReplayed: ticks.length,
    durationS: events.length ? r2((events[events.length - 1]!.tMs - t0) / 1000) : 0,
    medianTickIntervalS: medianDt === null ? null : r2(medianDt),
    offRouteEpisodes,
    offRouteEpisodesInLog,
    reroutesStarted,
    reroutesStartedByReason: startedByReason,
    reroutesRefused,
    rerouteBlockedInLog: blockedInLog,
    timeouts,
    failed,
    committed,
    staleResponses: stale,
    staleByReason,
    longestRequestToCommitMs: longestReq,
    longestOffRouteToCommitMs: longestOff,
    finalRouteGeneration: st.routeGeneration,
    parity: {
      ticksCompared: par.n,
      headingMaxAbsDeltaDeg: par.hN ? r2(par.hMax) : null,
      headingMeanAbsDeltaDeg: par.hN ? r2(par.hSum / par.hN) : null,
      distToRouteMaxAbsDeltaM: par.dN ? r2(par.dMax) : null,
      offRouteMismatches: par.off,
      staleMismatches: par.stale,
      generationMismatches: par.gen,
    },
  };

  return { timeline, ticks, summary, warnings, header: parsed.header };
}

/** Bequem: Text → Events → Replay. */
export function replayNavDiagText(text: string, opts: ReplayOptions = {}): ReplayResult & { skipped: NavDiagParseResult["skipped"] } {
  const parsed = parseNavDiagLog(text);
  const res = replayNavDiag(parsed.events, parsed, opts);
  return { ...res, skipped: parsed.skipped };
}
