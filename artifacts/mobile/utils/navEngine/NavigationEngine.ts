/**
 * NavigationEngine — ein GPS-Tick: Filter → Match → Heading → Progress → Off-Route → Maneuver → ETA → Zoom.
 * Kein React, keine Netzwerk-Side-Effects (Reroute startet der Screen).
 */

import {
  createOffRouteTrackerState,
  evaluateNavOffRouteSample,
  NAV_ROUTE_PROGRESS_BACKTRACK_M,
  NAV_ROUTE_PROGRESS_MAX_LATERAL_M,
} from "../navOffRouteReroute";
import {
  createNavHeadingSmootherState,
  createNavPositionSmootherState,
  deriveNavSpeedMps,
  NAV_MARKER_SNAP_MAX_LATERAL_M,
  NAV_POLY_LOOKAHEAD_M,
  resolveNavSpeedMps,
  tickNavHeading,
  tickNavPosition,
} from "../navHeadingSmoother";
import {
  advanceRouteProgressM,
  bearingAlongPolylineLookaheadDeg,
  distanceToForwardPolylineM,
  remainingAlongPolyline,
  scaleRemainingToAuthoritative,
  snapLatLonToPolyline,
} from "../routeRemainingAlongPolyline";
import { bearingDegrees, shortestRotationDelta } from "../liveDriverMarkerMotion";
import { buildManeuverOut } from "./ManeuverEngine";
import {
  createNavCameraZoomState,
  NAV_CAMERA_PITCH_NAV,
  tickNavCameraZoom,
} from "./navCameraZoom";
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

export function createNavEngineState(): NavEngineState {
  return {
    position: createNavPositionSmootherState(),
    heading: createNavHeadingSmootherState(),
    offRoute: createOffRouteTrackerState(),
    cameraZoom: createNavCameraZoomState(),
    routeProgressM: 0,
    stepIdx: 0,
    lastRawFix: null,
    rerouteInFlight: false,
  };
}

/** Nach neuer Route: Progress + Heading an Polyline ausrichten. */
export function resetNavEngineForRoute(
  state: NavEngineState,
  route: NavRouteSnapshot,
  at: LatLon,
  opts?: { headingDeg?: number | null },
): NavEngineState {
  const progress = advanceRouteProgressM(0, route.polyline, at, {
    maxLateralForAdvanceM: NAV_ROUTE_PROGRESS_MAX_LATERAL_M,
  });
  const routeBearing =
    opts?.headingDeg ??
    bearingAlongPolylineLookaheadDeg(route.polyline, at, NAV_POLY_LOOKAHEAD_M);
  const heading =
    routeBearing != null && Number.isFinite(routeBearing)
      ? { heading: routeBearing, lastUpdateMs: Date.now() }
      : state.heading;
  return {
    ...state,
    routeProgressM: progress,
    stepIdx: 0,
    offRoute: createOffRouteTrackerState(),
    heading,
    rerouteInFlight: false,
  };
}

export function setNavEngineRerouteInFlight(
  state: NavEngineState,
  inFlight: boolean,
): NavEngineState {
  return { ...state, rerouteInFlight: inFlight };
}

export function tickNavEngine(
  state: NavEngineState,
  fix: NavFix,
  route: NavRouteSnapshot | null,
  opts?: { userPreferredZoom?: number | null },
): NavTickResult {
  const now = fix.nowMs;

  // 1–2 Position filter
  const posTick = tickNavPosition(state.position, fix.lat, fix.lon);
  const filtered: LatLon = { lat: posTick.lat, lon: posTick.lon };

  let movementBearing: number | null = null;
  let derivedSpeedMps: number | null = null;
  let fixDtMs: number | null = null;
  const prevRaw = state.lastRawFix;
  if (prevRaw) {
    const moved = haversineM(
      { lat: prevRaw.lat, lon: prevRaw.lon },
      { lat: fix.lat, lon: fix.lon },
    );
    fixDtMs = now - prevRaw.atMs;
    derivedSpeedMps = deriveNavSpeedMps(moved, fixDtMs);
    if (moved >= 3 && fixDtMs >= 200) {
      movementBearing = bearingDegrees(prevRaw.lat, prevRaw.lon, fix.lat, fix.lon);
    }
  }

  const gpsSpeedForDiag =
    fix.speedMps != null && Number.isFinite(fix.speedMps) ? fix.speedMps : null;
  const effectiveSpeed = resolveNavSpeedMps(fix.speedMps, derivedSpeedMps);
  const polyline = route?.polyline ?? [];

  // 3 Map match (display)
  const snap = snapLatLonToPolyline(polyline, filtered, NAV_MARKER_SNAP_MAX_LATERAL_M);
  const display: LatLon = snap ?? filtered;
  const snapped = snap != null;

  // 4 Heading (Poly vom Snap wenn möglich)
  const polyBearing = bearingAlongPolylineLookaheadDeg(
    polyline,
    snap ?? filtered,
    NAV_POLY_LOOKAHEAD_M,
  );
  const headingTick = tickNavHeading(state.heading, {
    speedMps: effectiveSpeed,
    courseDeg: fix.courseDeg,
    polylineBearingDeg: polyBearing,
    movementBearingDeg: movementBearing,
    fallbackBearingDeg: null,
    nowMs: now,
  });

  let routeProgressM = state.routeProgressM;
  let offRoute = state.offRoute;
  let confirmedOffRoute = false;
  let remainingDistM = 0;
  let remainingMin = 1;
  let forwardDistM: number | null = null;
  let courseForOffDeg: number | null = null;
  let headingForced = false;
  let stallForced = false;

  if (route && polyline.length >= 2) {
    // 5 Progress
    routeProgressM = advanceRouteProgressM(routeProgressM, polyline, filtered, {
      maxLateralForAdvanceM: NAV_ROUTE_PROGRESS_MAX_LATERAL_M,
    });
    const fromProg = Math.max(0, routeProgressM - NAV_ROUTE_PROGRESS_BACKTRACK_M);
    forwardDistM = distanceToForwardPolylineM(polyline, filtered, fromProg);
    courseForOffDeg =
      fix.courseDeg != null && Number.isFinite(fix.courseDeg)
        ? fix.courseDeg
        : headingTick.heading;

    // 6 Off-route (nur wenn kein Reroute schon läuft)
    if (!state.rerouteInFlight) {
      const offEval = evaluateNavOffRouteSample({
        state: offRoute,
        nowMs: now,
        forwardDistM,
        committedProgressM: routeProgressM,
        courseDeg: courseForOffDeg,
        routeBearingDeg: polyBearing,
        speedMps: effectiveSpeed,
      });
      offRoute = offEval.state;
      confirmedOffRoute = offEval.confirmedOffRoute;
      headingForced = offEval.headingForced;
      stallForced = offEval.stallForced;
    }

    const along = remainingAlongPolyline(polyline, filtered);
    if (along && route.authoritativeDistM > 0) {
      const scaled = scaleRemainingToAuthoritative(
        along,
        route.authoritativeDistM,
        route.authoritativeEtaMin,
      );
      remainingDistM = scaled.remainingDistM;
      remainingMin = scaled.remainingMin;
    } else if (route.authoritativeDistM > 0) {
      remainingDistM = route.authoritativeDistM;
      remainingMin = Math.max(1, route.authoritativeEtaMin);
    }
  }

  const guidanceStale = state.rerouteInFlight;
  const maneuverBuilt = buildManeuverOut(
    route?.steps ?? [],
    state.stepIdx,
    polyline,
    filtered,
    guidanceStale,
  );

  const zoomTick = tickNavCameraZoom(state.cameraZoom, {
    speedMps: effectiveSpeed,
    nowMs: now,
    userPreferredZoom: opts?.userPreferredZoom,
  });

  const nextState: NavEngineState = {
    position: posTick.state,
    heading: headingTick.state,
    offRoute,
    cameraZoom: zoomTick.state,
    routeProgressM,
    stepIdx: guidanceStale ? state.stepIdx : maneuverBuilt.stepIdx,
    lastRawFix: { lat: fix.lat, lon: fix.lon, atMs: now },
    rerouteInFlight: state.rerouteInFlight,
  };

  let headingDelta: number | null = null;
  if (
    courseForOffDeg != null &&
    polyBearing != null &&
    Number.isFinite(courseForOffDeg) &&
    Number.isFinite(polyBearing)
  ) {
    headingDelta = Math.abs(shortestRotationDelta(courseForOffDeg, polyBearing));
  }

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
    cameraZoom: zoomTick.zoom,
    cameraPitch: NAV_CAMERA_PITCH_NAV,
    diag: {
      forwardDistM,
      routeBearingDeg: polyBearing,
      courseForOffDeg,
      headingDeltaDeg: headingDelta,
      headingForced,
      stallForced,
      gpsSpeedMps: gpsSpeedForDiag,
      derivedSpeedMps,
      fixDtMs,
    },
  };

  return { state: nextState, output };
}
