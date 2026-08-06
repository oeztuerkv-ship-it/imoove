/**
 * Laufzeit-Diagnose Fahrer-Navi ([NavDiag]).
 * Beantwortet: wer tickt GPS, wer steuert Kamera, wer reroutet — mit Messwerten.
 * Keine Verhaltens-„Optimierung“ — nur Logs + Crash-Guards.
 */

import { Platform } from "react-native";
import { shortestRotationDelta } from "./liveDriverMarkerMotion";

const TAG = "[NavDiag]";

let gpsTickCount = 0;
let cameraCallCount = 0;
let lastGpsLogMs = 0;
let lastCameraLogMs = 0;
let sessionStartedAtMs = Date.now();
let lastRerouteRequestAtMs: number | null = null;
let offRouteTrueSinceMs: number | null = null;

export function navDiagResetSession(reason: string): void {
  gpsTickCount = 0;
  cameraCallCount = 0;
  lastGpsLogMs = 0;
  lastCameraLogMs = 0;
  sessionStartedAtMs = Date.now();
  lastRerouteRequestAtMs = null;
  offRouteTrueSinceMs = null;
  console.log(TAG, "session_reset", { reason, platform: Platform.OS, at: new Date().toISOString() });
}

export function navDiagGpsEffect(event: "mount" | "unmount", detail?: Record<string, unknown>): void {
  console.log(TAG, `gps_watch_${event}`, {
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

  console.log(TAG, "gps_tick", {
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
  });
}

export type NavDiagCameraInput = {
  /** Datei/Funktion die den Call auslöst */
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
  console.log(TAG, "camera", {
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
  console.log(TAG, "reroute_decision", {
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
  console.log(TAG, "reroute_request_start", {
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
  console.log(TAG, "reroute_request_done", input);
}

export function navDiagPipelineOwners(): void {
  console.log(TAG, "pipeline_owners", {
    gpsTick: "navigation.tsx watchPositionSafe → tickNavEngine (navEngine/NavigationEngine.ts)",
    headingPitchZoom:
      "Heading: tickNavHeading via Engine; Pitch: NAV_CAMERA_PITCH_NAV (62) in focusNavigationCamera; Zoom: tickNavCameraZoom via Engine → preferredZoomRef",
    cameraApply:
      "ONLY navigation.tsx focusNavigationCamera → mapRef.setCamera|animateCamera (guards + NavDiag)",
    alsoApplyDriverNavFix:
      "LEGACY still used by focusNavigationCamera bootstrap (heading null) + handleRecenterNav — parallel pose path",
    rerouteDecide:
      "Engine output.confirmedOffRoute → navigation.tsx canStartReroute → requestNavRouteFrom",
    dashboardGps:
      "dashboard.tsx may keep a separate watchPositionSafe if screen still mounted under stack",
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
