/**
 * Laufzeit-Diagnose Fahrer-Navi ([NavDiag]).
 *
 * Wichtig (iOS Store/OTA): `console.log` erscheint in Konsole.app oft NICHT.
 * Deshalb: Ring-Buffer + In-App-Overlay (Subscribe) + optional AsyncStorage.
 * `console.log` bleibt für Metro / Android logcat.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { shortestRotationDelta } from "./liveDriverMarkerMotion";

const TAG = "[NavDiag]";
const MAX_LINES = 250;
const STORAGE_KEY = "@onroda/nav_diag_ring_v1";

let gpsTickCount = 0;
let cameraCallCount = 0;
let lastGpsLogMs = 0;
let lastCameraLogMs = 0;
let sessionStartedAtMs = Date.now();
let lastRerouteRequestAtMs: number | null = null;
let offRouteTrueSinceMs: number | null = null;

const lines: string[] = [];
const listeners = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let storageHydrated = false;

function notify(): void {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore subscriber errors */
    }
  });
}

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        at: new Date().toISOString(),
        lines: lines.slice(-MAX_LINES),
      }),
    ).catch(() => {});
  }, 1500);
}

function pushLine(kind: string, payload: Record<string, unknown> | object): void {
  const ts = new Date().toISOString().slice(11, 23);
  const line = `${ts} ${kind} ${safeJson(payload)}`;
  lines.push(line);
  while (lines.length > MAX_LINES) lines.shift();
  // Metro / Android logcat — iOS Release Unified Log oft leer → Overlay nutzen
  console.log(TAG, kind, payload);
  notify();
  schedulePersist();
}

function safeJson(payload: unknown): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return '"[unserializable]"';
  }
}

/** Hydrate ring from last session (z. B. nach Crash / App-Neustart). */
export async function navDiagHydrateFromStorage(): Promise<void> {
  if (storageHydrated) return;
  storageHydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { lines?: unknown };
    if (!Array.isArray(parsed.lines)) return;
    const restored = parsed.lines
      .filter((x): x is string => typeof x === "string")
      .slice(-MAX_LINES);
    if (restored.length === 0) return;
    // Voranstellen, aktuelle Session danach weiter
    lines.unshift(...restored.map((l) => `(prev) ${l}`));
    while (lines.length > MAX_LINES) lines.shift();
    notify();
  } catch {
    /* ignore */
  }
}

export function subscribeNavDiag(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNavDiagLines(): string[] {
  return lines.slice();
}

export function getNavDiagTranscript(): string {
  return [
    `${TAG} transcript platform=${Platform.OS} lines=${lines.length} at=${new Date().toISOString()}`,
    ...lines,
  ].join("\n");
}

export function clearNavDiagBuffer(reason = "manual_clear"): void {
  lines.length = 0;
  pushLine("buffer_cleared", { reason });
}

export function navDiagResetSession(reason: string): void {
  gpsTickCount = 0;
  cameraCallCount = 0;
  lastGpsLogMs = 0;
  lastCameraLogMs = 0;
  sessionStartedAtMs = Date.now();
  lastRerouteRequestAtMs = null;
  offRouteTrueSinceMs = null;
  pushLine("session_reset", { reason, platform: Platform.OS, at: new Date().toISOString() });
}

export function navDiagHeartbeat(detail?: Record<string, unknown>): void {
  pushLine("heartbeat", {
    sessionAgeMs: Date.now() - sessionStartedAtMs,
    gpsTickCount,
    cameraCallCount,
    ...detail,
  });
}

export function navDiagGpsEffect(event: "mount" | "unmount", detail?: Record<string, unknown>): void {
  pushLine(`gps_watch_${event}`, {
    ...detail,
    sessionAgeMs: Date.now() - sessionStartedAtMs,
  });
}

export type NavDiagTickInput = {
  source: "boot" | "watch";
  engineCalled: boolean;
  engineError?: string;
  rawGps: { lat: number; lon: number; speed?: number | null; course?: number | null };
  filtered?: { lat: number; lon: number };
  display?: { lat: number; lon: number };
  snapped?: boolean;
  heading?: number | null;
  speedMps?: number | null;
  routeProgressM?: number;
  forwardDistM?: number | null;
  routeBearingDeg?: number | null;
  courseForOffDeg?: number | null;
  headingDeltaDeg?: number | null;
  confirmedOffRoute?: boolean;
  guidanceStale?: boolean;
  remainingDistM?: number;
  distToManeuverM?: number;
  cameraZoom?: number;
  cameraPitch?: number;
  polylinePoints?: number;
  stepIdx?: number;
  rerouteInFlight?: boolean;
  gpsSpeedMps?: number | null;
  derivedSpeedMps?: number | null;
  fixDtMs?: number | null;
};

/** Jeder GPS-Tick (gedrosselt ~1/s für ausführliche Zeile; Off-Route/Fehler immer). */
export function navDiagEngineTick(input: NavDiagTickInput): void {
  gpsTickCount += 1;
  const now = Date.now();
  const force =
    !!input.engineError ||
    !!input.confirmedOffRoute ||
    input.guidanceStale === true ||
    now - lastGpsLogMs >= 1000;

  if (input.confirmedOffRoute) {
    if (offRouteTrueSinceMs == null) offRouteTrueSinceMs = now;
  } else {
    offRouteTrueSinceMs = null;
  }

  if (!force) return;
  lastGpsLogMs = now;

  pushLine("gps_tick", {
    n: gpsTickCount,
    source: input.source,
    tickNavEngine: input.engineCalled,
    engineError: input.engineError ?? null,
    rawGps: {
      lat: round6(input.rawGps.lat),
      lon: round6(input.rawGps.lon),
      speed: input.rawGps.speed ?? null,
      course: input.rawGps.course ?? null,
    },
    filtered: input.filtered
      ? { lat: round6(input.filtered.lat), lon: round6(input.filtered.lon) }
      : null,
    display: input.display
      ? { lat: round6(input.display.lat), lon: round6(input.display.lon) }
      : null,
    markerOn: input.snapped ? "snapped_polyline" : "filtered_or_raw_gps",
    heading: input.heading ?? null,
    speedMps: input.speedMps ?? null,
    progressM: input.routeProgressM ?? null,
    forwardDistM: input.forwardDistM ?? null,
    routeBearingDeg: input.routeBearingDeg ?? null,
    courseForOffDeg: input.courseForOffDeg ?? null,
    headingDeltaDeg: input.headingDeltaDeg ?? null,
    confirmedOffRoute: input.confirmedOffRoute ?? false,
    offRouteTrueForMs:
      offRouteTrueSinceMs != null ? now - offRouteTrueSinceMs : null,
    guidanceStale: input.guidanceStale ?? false,
    remainingDistM: input.remainingDistM ?? null,
    distToManeuverM: input.distToManeuverM ?? null,
    cameraZoom: input.cameraZoom ?? null,
    cameraPitch: input.cameraPitch ?? null,
    polylinePoints: input.polylinePoints ?? 0,
    stepIdx: input.stepIdx ?? null,
    rerouteInFlight: input.rerouteInFlight ?? false,
    gpsSpeedMps: input.gpsSpeedMps ?? null,
    derivedSpeedMps: input.derivedSpeedMps ?? null,
    fixDtMs: input.fixDtMs ?? null,
  });
}

export type NavDiagCameraInput = {
  caller: string;
  method: "setCamera" | "animateCamera" | "skipped" | "error";
  reason?: string;
  lat: number;
  lon: number;
  heading: number;
  pitch: number;
  zoom?: number;
  altitude?: number | null;
  durationMs?: number;
  force?: boolean;
  still?: boolean;
  error?: string;
};

export function navDiagCamera(input: NavDiagCameraInput): void {
  cameraCallCount += 1;
  const now = Date.now();
  const force =
    input.method === "error" ||
    input.method === "skipped" ||
    !!input.force ||
    now - lastCameraLogMs >= 800;
  if (!force) return;
  lastCameraLogMs = now;
  pushLine("camera", {
    n: cameraCallCount,
    perSecApprox: cameraCallCount / Math.max(1, (now - sessionStartedAtMs) / 1000),
    caller: input.caller,
    method: input.method,
    reason: input.reason ?? null,
    center: { lat: round6(input.lat), lon: round6(input.lon) },
    heading: input.heading,
    pitch: input.pitch,
    zoom: input.zoom ?? null,
    altitude: input.altitude ?? null,
    durationMs: input.durationMs ?? null,
    force: input.force ?? false,
    still: input.still ?? false,
    error: input.error ?? null,
  });
}

export function navDiagRerouteDecision(input: {
  willRequest: boolean;
  reason: "off_route" | "recover" | "blocked_inflight" | "blocked_cooldown" | "not_confirmed";
  forwardDistM?: number | null;
  headingDeltaDeg?: number | null;
  progressM?: number;
  confirmedOffRoute?: boolean;
  inFlight?: boolean;
  cooldownLeftMs?: number;
  from?: { lat: number; lon: number };
}): void {
  pushLine("reroute_decision", {
    ...input,
    from: input.from
      ? { lat: round6(input.from.lat), lon: round6(input.from.lon) }
      : null,
    msSinceSession: Date.now() - sessionStartedAtMs,
    msSinceLastRerouteRequest:
      lastRerouteRequestAtMs != null ? Date.now() - lastRerouteRequestAtMs : null,
  });
}

export function navDiagRerouteRequestStarted(input: {
  reason: "initial" | "reroute" | "recover";
  from: { lat: number; lon: number };
  offRouteTrueForMs?: number | null;
}): void {
  lastRerouteRequestAtMs = Date.now();
  pushLine("reroute_request_start", {
    reason: input.reason,
    from: { lat: round6(input.from.lat), lon: round6(input.from.lon) },
    offRouteTrueForMs: input.offRouteTrueForMs ?? null,
    at: new Date().toISOString(),
  });
}

export function navDiagRerouteRequestDone(input: {
  reason: "initial" | "reroute" | "recover";
  ok: boolean;
  elapsedMs: number;
  error?: string;
}): void {
  pushLine("reroute_request_done", input);
}

export function navDiagPipelineOwners(): void {
  pushLine("pipeline_owners", {
    gpsTick: "navigation.tsx watchPositionSafe → tickNavEngine (navEngine/NavigationEngine.ts)",
    headingPitchZoom:
      "Heading: tickNavHeading via Engine (preferRouteBearing when snapped); Pitch: NAV_CAMERA_PITCH_NAV (45) in focusNavigationCamera; Zoom: tickNavCameraZoom via Engine → preferredZoomRef",
    cameraApply:
      "ONLY navigation.tsx focusNavigationCamera → mapRef.setCamera|animateCamera (overlap → setCamera catch-up)",
    alsoApplyDriverNavFix:
      "LEGACY: heading bootstrap only (no lat/lon overwrite) + recenter (then progress-snap)",
    enhancedLocation:
      "Marker + camera = engine.display (progress-locked snap); filtered = off-route/share only",
    rerouteDecide:
      "Engine output.confirmedOffRoute → navigation.tsx canStartReroute → requestNavRouteFrom",
    dashboardGps:
      "dashboard.tsx may keep a separate watchPositionSafe if screen still mounted under stack",
    logSink:
      "In-App Overlay + AsyncStorage ring; console.log only for Metro/Android — iOS Release ≠ Konsole.app",
  });
}

export function headingDeltaDeg(
  courseDeg: number | null | undefined,
  routeBearingDeg: number | null | undefined,
): number | null {
  if (
    courseDeg == null ||
    routeBearingDeg == null ||
    !Number.isFinite(courseDeg) ||
    !Number.isFinite(routeBearingDeg)
  ) {
    return null;
  }
  return Math.abs(shortestRotationDelta(courseDeg, routeBearingDeg));
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Native Kamera-Args müssen endlich sein — sonst iOS/Android Map-Crash. */
export function isFiniteCameraNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}
