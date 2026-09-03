/**
 * NavigationEngine — ein GPS-Tick: Filter → Match → Heading → Progress → Off-Route → Maneuver → ETA.
 * Zoom gehört der CameraEngine (P3/P4).
 * Kein React, keine Netzwerk-Side-Effects (Reroute startet der Screen via RerouteEngine).
 */

import {
  createNavHeadingSmootherState,
  createNavPositionSmootherState,
  NAV_POLY_LOOKAHEAD_M,
  resolveNavSpeedMps,
  tickNavHeading,
  tickNavPosition,
} from "../navHeadingSmoother";
import { bearingAlongPolylineLookaheadDeg } from "../routeRemainingAlongPolyline";
import { bearingDegrees, shortestRotationDelta } from "../liveDriverMarkerMotion";
import { matchMapDisplayPose } from "./MapMatchingEngine";
import { buildManeuverOut } from "./ManeuverEngine";
import {
  createOffRouteTrackerState,
  evaluateNavOffRouteSample,
  measureRestRouteLateralM,
} from "./OffRouteEngine";
import {
  initCommittedProgressForRoute,
  tickRouteProgress,
} from "./RouteProgressEngine";
import { createNavCameraZoomState, NAV_CAMERA_PITCH_NAV } from "./navCameraZoom";
import { nextNavigationSessionId, shouldEvaluateOffRoute } from "./navLifecycle";
import {
  commitNavigationFromTick,
  commitNavigationRerouteFlag,
  commitNavigationRouteBound,
  createNavigationState,
} from "./NavigationState";
import type {
  LatLon,
  NavEngineOutput,
  NavEngineState,
  NavFix,
  NavRouteSnapshot,
  NavTickResult,
} from "./types";

function haversineM(a: LatLon, b: LatLon): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function createNavEngineState(
  sessionId: number = nextNavigationSessionId(),
): NavEngineState {
  return {
    position: createNavPositionSmootherState(),
    heading: createNavHeadingSmootherState(),
    offRoute: createOffRouteTrackerState(),
    cameraZoom: createNavCameraZoomState(),
    routeProgressM: 0,
    stepIdx: 0,
    lastRawFix: null,
    rerouteInFlight: false,
    routeGeneration: 0,
    navigationSessionId: sessionId,
    gpsResyncing: false,
    runtime: createNavigationState(),
  };
}

/** Resume: alten Fix verwerfen, Off-Route halten, gpsState STALE bis frischer Tick. */
export function beginNavGpsResync(state: NavEngineState): NavEngineState {
  return {
    ...state,
    lastRawFix: null,
    gpsResyncing: true,
    offRoute: createOffRouteTrackerState(),
    runtime: {
      ...state.runtime,
      gpsState: "STALE",
      lastFixAt: null,
      confirmedOffRoute: false,
    },
  };
}

/** Nach neuer Route: Progress von Pose neu. Kein Route-/Ziel-Bearing als Fahrzeug-Heading. */
export function resetNavEngineForRoute(
  state: NavEngineState,
  route: NavRouteSnapshot,
  at: LatLon,
  _opts?: { headingDeg?: number | null },
): NavEngineState {
  const progress = initCommittedProgressForRoute(route.polyline, at);
  const next: NavEngineState = {
    ...state,
    routeProgressM: progress,
    stepIdx: 0,
    offRoute: createOffRouteTrackerState(),
    heading: state.heading,
    rerouteInFlight: false,
    routeGeneration: route.generation,
  };
  next.runtime = commitNavigationRouteBound(state.runtime, {
    generation: route.generation,
    progressM: progress,
    display: at,
    heading: state.runtime.heading,
    isSnapped: false,
    remainingDistM: 0,
    remainingMin: 1,
  });
  return next;
}

export function setNavEngineRerouteInFlight(
  state: NavEngineState,
  inFlight: boolean,
): NavEngineState {
  return { ...state, rerouteInFlight: inFlight, runtime: commitNavigationRerouteFlag(state.runtime, inFlight) };
}

/**
 * Bei confirmed Off-Route / Reroute-Start: gebundene Generation vorziehen,
 * damit der alte Snapshot sofort stale ist (kein Match/Progress/Guidance auf alter Geometrie).
 */
export function invalidateNavRouteGeneration(
  state: NavEngineState,
  toGeneration: number,
): NavEngineState {
  const gen = Math.max(state.routeGeneration, Math.max(0, toGeneration));
  return {
    ...state,
    rerouteInFlight: true,
    routeGeneration: gen,
    offRoute: createOffRouteTrackerState(),
    stepIdx: 0,
    runtime: commitNavigationRerouteFlag(state.runtime, true),
  };
}

function frozenTickResult(state: NavEngineState): NavTickResult {
  const display = state.runtime.displayPosition ?? { lat: 0, lon: 0 };
  const filtered = state.runtime.filteredPosition ?? display;
  return {
    state,
    navigation: state.runtime,
    output: {
      filtered,
      display,
      snapped: state.runtime.isSnapped,
      heading: state.runtime.heading,
      speedMps: state.runtime.speed,
      routeProgressM: state.runtime.routeProgress,
      remainingDistM: state.runtime.remainingDistM,
      remainingMin: state.runtime.remainingMin,
      distToManeuverM: state.runtime.distToManeuverM,
      stepIdx: state.stepIdx,
      maneuver: state.runtime.maneuverState,
      guidanceStale: state.runtime.guidanceStale,
      confirmedOffRoute: false,
      cameraZoom: state.cameraZoom.zoom,
      cameraPitch: NAV_CAMERA_PITCH_NAV,
      diag: {
        forwardDistM: null,
        routeBearingDeg: null,
        courseForOffDeg: null,
        headingDeltaDeg: null,
        gpsSpeedMps: null,
        derivedSpeedMps: null,
        fixDtMs: null,
        routeGeneration: 0,
        boundRouteGeneration: state.routeGeneration,
      },
    },
  };
}

export function tickNavEngine(
  state: NavEngineState,
  fix: NavFix,
  route: NavRouteSnapshot | null,
  opts?: { sessionId?: number; routeGeneration?: number },
): NavTickResult {
  if (opts?.sessionId != null && opts.sessionId !== state.navigationSessionId) {
    return frozenTickResult(state);
  }
  if (
    opts?.routeGeneration != null &&
    state.routeGeneration > 0 &&
    opts.routeGeneration !== state.routeGeneration
  ) {
    return frozenTickResult(state);
  }

  const now = fix.nowMs;
  const finishingResync = state.gpsResyncing;

  // 1–2 Position filter
  const posTick = tickNavPosition(state.position, fix.lat, fix.lon);
  const filtered: LatLon = { lat: posTick.lat, lon: posTick.lon };

  let movementBearing: number | null = null;
  let derivedSpeedMps: number | null = null;
  const prevRaw = finishingResync ? null : state.lastRawFix;
  if (prevRaw) {
    const moved = haversineM(
      { lat: prevRaw.lat, lon: prevRaw.lon },
      { lat: fix.lat, lon: fix.lon },
    );
    const dtSec = Math.max(0.05, (now - prevRaw.atMs) / 1000);
    if (moved >= 1) derivedSpeedMps = moved / dtSec;
    if (moved >= 3) {
      movementBearing = bearingDegrees(prevRaw.lat, prevRaw.lon, fix.lat, fix.lon);
    }
  }

  const effectiveSpeed = resolveNavSpeedMps(fix.speedMps, derivedSpeedMps);
  const routeGen = route?.generation ?? 0;
  const staleRoute =
    !!route &&
    routeGen > 0 &&
    state.routeGeneration > 0 &&
    routeGen < state.routeGeneration;
  /** Aktive Geometrie für Match/Progress: keine stale Generation. */
  const activeRoute = route && !staleRoute ? route : null;
  const polyline = activeRoute?.polyline ?? [];

  // 3 Map match → einheitliche Display-Pose (kein Snap während Reroute / auf stale Poly)
  const match = matchMapDisplayPose({
    filtered,
    polyline,
    boundRouteGeneration: state.routeGeneration,
    routeGeneration: routeGen,
    allowSnap: !state.rerouteInFlight && !staleRoute,
  });
  const display = match.display;
  const snapped = match.snapped;

  // 4 Heading — Course/Movement; Poly-Bearing nicht als Fahrzeug-Heading (P2).
  const polyBearing = bearingAlongPolylineLookaheadDeg(
    polyline,
    display,
    NAV_POLY_LOOKAHEAD_M,
  );
  const headingTick = tickNavHeading(state.heading, {
    speedMps: effectiveSpeed,
    courseDeg: fix.courseDeg,
    polylineBearingDeg: null,
    movementBearingDeg: movementBearing,
    fallbackBearingDeg: null,
    nowMs: now,
  });

  let routeProgressM = state.routeProgressM;
  let offRoute = state.offRoute;
  let confirmedOffRoute = false;
  let remainingDistM = 0;
  let remainingMin = 1;
  let restLateralM: number | null = null;
  let courseForOff: number | null = null;

  if (activeRoute && polyline.length >= 2) {
    // 5 Progress — kanonisch committed; Pose = display wenn gematcht, sonst filtered
    const progressAt = snapped ? display : filtered;
    const prog = tickRouteProgress({
      polyline,
      at: progressAt,
      committedProgressM: routeProgressM,
      routeGeneration: state.routeGeneration,
      snapshotGeneration: routeGen,
      authoritativeDistM: activeRoute.authoritativeDistM,
      authoritativeEtaMin: activeRoute.authoritativeEtaMin,
      allowAdvance: !state.rerouteInFlight,
    });
    routeProgressM = prog.committedProgressM;
    remainingDistM = prog.remainingDistM;
    remainingMin = prog.remainingMin;

    courseForOff =
      fix.courseDeg != null && Number.isFinite(fix.courseDeg)
        ? fix.courseDeg
        : headingTick.heading;

    restLateralM = measureRestRouteLateralM(
      polyline,
      { lat: fix.lat, lon: fix.lon },
      routeProgressM,
    );

    /**
     * 6 Off-Route (Schritt 5): Lateral zur Rest-Route vom **Roh-GPS-Fix**
     * (nicht gesnappt → Distanz ≈ 0; nicht EMA-filtered → Sprünge/Falschabbiegen
     * werden nicht weggeglättet).
     */
    if (
      !state.rerouteInFlight &&
      shouldEvaluateOffRoute("ACTIVE", finishingResync)
    ) {
      const offEval = evaluateNavOffRouteSample({
        state: offRoute,
        nowMs: now,
        forwardDistM: restLateralM,
        committedProgressM: routeProgressM,
        courseDeg: courseForOff,
        routeBearingDeg: polyBearing,
        speedMps: effectiveSpeed,
        routeGeneration: state.routeGeneration,
        snapshotGeneration: routeGen,
      });
      offRoute = offEval.state;
      confirmedOffRoute = offEval.confirmedOffRoute;
    }
  }

  const headingDeltaDeg =
    courseForOff != null &&
    polyBearing != null &&
    Number.isFinite(courseForOff) &&
    Number.isFinite(polyBearing)
      ? Math.abs(shortestRotationDelta(courseForOff, polyBearing))
      : null;
  const fixDtMs = prevRaw ? now - prevRaw.atMs : null;

  /** Guidance sofort stale bei Reroute ODER bestätigtem Off-Route (vor Screen-Start). */
  const guidanceStale = state.rerouteInFlight || confirmedOffRoute;
  const maneuverBuilt = buildManeuverOut(
    activeRoute?.steps ?? [],
    state.stepIdx,
    polyline,
    guidanceStale,
    {
      committedProgressM: routeProgressM,
      routeGeneration: routeGen,
      boundRouteGeneration: state.routeGeneration,
    },
  );

  const nextState: NavEngineState = {
    position: posTick.state,
    heading: headingTick.state,
    offRoute,
    cameraZoom: state.cameraZoom,
    routeProgressM,
    stepIdx: guidanceStale ? state.stepIdx : maneuverBuilt.stepIdx,
    lastRawFix: { lat: fix.lat, lon: fix.lon, atMs: now },
    rerouteInFlight: state.rerouteInFlight,
    routeGeneration: state.routeGeneration,
    navigationSessionId: state.navigationSessionId,
    gpsResyncing: false,
    runtime: state.runtime,
  };

  const output: NavEngineOutput = {
    filtered,
    display,
    snapped,
    heading: headingTick.heading,
    speedMps: effectiveSpeed,
    routeProgressM,
    remainingDistM,
    remainingMin,
    distToManeuverM: guidanceStale ? 0 : maneuverBuilt.distToManeuverM,
    stepIdx: nextState.stepIdx,
    maneuver: maneuverBuilt.maneuver,
    guidanceStale,
    confirmedOffRoute,
    cameraZoom: state.cameraZoom.zoom,
    cameraPitch: NAV_CAMERA_PITCH_NAV,
    diag: {
      forwardDistM: restLateralM,
      routeBearingDeg: polyBearing,
      courseForOffDeg: courseForOff,
      headingDeltaDeg,
      gpsSpeedMps: fix.speedMps ?? null,
      derivedSpeedMps,
      fixDtMs,
      routeGeneration: routeGen,
      boundRouteGeneration: state.routeGeneration,
    },
  };

  nextState.runtime = commitNavigationFromTick(
    state.runtime,
    fix,
    nextState,
    output,
    polyline.length >= 2,
    { movementBearingDeg: movementBearing },
  );
  output.heading = nextState.runtime.heading;

  return { state: nextState, output, navigation: nextState.runtime };
}
