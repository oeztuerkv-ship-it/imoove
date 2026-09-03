/**
 * NavigationState reducer — atomarer Commit nach einem Tick.
 * headingState ist verbindlich: VALID übernehmen, UNRELIABLE halten, LOST nicht neu drehen.
 */

import {
  isMovingForNavHeading,
  isTrustedNavCourse,
  isUsableCourse,
} from "../navHeadingSmoother";
import type {
  LatLon,
  NavEngineState,
  NavFix,
  NavigationState,
  NavHeadingDiagReason,
  NavHeadingQualityKind,
  NavHeadingStateKind,
  NavManeuverOut,
  NavRouteRuntimeKind,
} from "./types";

export function createNavigationState(): NavigationState {
  return {
    rawPosition: null,
    filteredPosition: null,
    snappedPosition: null,
    displayPosition: null,
    speed: null,
    accuracy: null,
    rawHeading: null,
    heading: null,
    headingAccuracy: null,
    headingQuality: "none",
    headingState: "LOST",
    lastValidHeading: null,
    headingReason: "gps_lost",
    isSnapped: false,
    gpsState: "LOST",
    routeState: "idle",
    routeGeneration: 0,
    routeProgress: 0,
    maneuverState: null,
    lastFixAt: null,
    lastValidHeadingAt: null,
    remainingDistM: 0,
    remainingMin: 1,
    distToManeuverM: 0,
    guidanceStale: false,
    confirmedOffRoute: false,
  };
}

export type NavHeadingCommitInput = {
  rawHeading: number | null;
  speed: number | null;
  movementBearingDeg?: number | null;
  nowMs: number;
};

export type NavHeadingCommitResult = {
  heading: number | null;
  headingState: NavHeadingStateKind;
  headingQuality: NavHeadingQualityKind;
  headingReason: NavHeadingDiagReason;
  lastValidHeading: number | null;
  lastValidHeadingAt: number | null;
};

/**
 * Verbindliche Heading-Policy. Kein Ziel-/Step-/Poly-Bearing, kein künstliches Nord (0).
 */
export function commitHeadingQuality(
  prev: Pick<NavigationState, "heading" | "lastValidHeading" | "lastValidHeadingAt">,
  input: NavHeadingCommitInput,
): NavHeadingCommitResult {
  const raw = isUsableCourse(input.rawHeading) ? input.rawHeading : null;
  const lastValid = isUsableCourse(prev.lastValidHeading) ? prev.lastValidHeading : null;

  let out: NavHeadingCommitResult;
  if (isTrustedNavCourse(raw, input.speed)) {
    out = {
      heading: raw,
      headingState: "VALID",
      headingQuality: "course",
      headingReason: "gps_heading_valid",
      lastValidHeading: raw,
      lastValidHeadingAt: input.nowMs,
    };
  } else if (
    isUsableCourse(input.movementBearingDeg) &&
    isMovingForNavHeading(input.speed)
  ) {
    out = {
      heading: input.movementBearingDeg,
      headingState: "VALID",
      headingQuality: "derived",
      headingReason: "movement_heading_valid",
      lastValidHeading: input.movementBearingDeg,
      lastValidHeadingAt: input.nowMs,
    };
  } else if (lastValid != null) {
    out = {
      heading: lastValid,
      headingState: "UNRELIABLE",
      headingQuality: "held",
      headingReason: isUsableCourse(raw) ? "heading_unreliable" : "hold_last_valid",
      lastValidHeading: lastValid,
      lastValidHeadingAt: prev.lastValidHeadingAt,
    };
  } else {
    out = {
      heading: isUsableCourse(prev.heading) ? prev.heading : null,
      headingState: "LOST",
      headingQuality: "none",
      headingReason: "gps_lost",
      lastValidHeading: null,
      lastValidHeadingAt: prev.lastValidHeadingAt,
    };
  }

  return out;
}

function classifyRouteState(
  engine: NavEngineState,
  confirmedOffRoute: boolean,
  hasRoute: boolean,
): NavRouteRuntimeKind {
  if (engine.rerouteInFlight) return "rerouting";
  if (confirmedOffRoute) return "off_route";
  if (hasRoute) return "navigating";
  return "idle";
}

export function commitNavigationFromTick(
  prev: NavigationState,
  fix: NavFix,
  engine: NavEngineState,
  tick: {
    filtered: LatLon;
    display: LatLon;
    snapped: boolean;
    speedMps: number | null;
    routeProgressM: number;
    remainingDistM: number;
    remainingMin: number;
    distToManeuverM: number;
    maneuver: NavManeuverOut | null;
    guidanceStale: boolean;
    confirmedOffRoute: boolean;
  },
  hasRoute: boolean,
  opts?: { movementBearingDeg?: number | null },
): NavigationState {
  const rawHeading =
    fix.courseDeg != null && Number.isFinite(fix.courseDeg) ? fix.courseDeg : null;
  const committed = commitHeadingQuality(prev, {
    rawHeading,
    speed: tick.speedMps,
    movementBearingDeg: opts?.movementBearingDeg ?? null,
    nowMs: fix.nowMs,
  });

  return {
    rawPosition: { lat: fix.lat, lon: fix.lon },
    filteredPosition: tick.filtered,
    snappedPosition: tick.snapped ? tick.display : null,
    displayPosition: tick.display,
    speed: tick.speedMps,
    accuracy:
      fix.accuracyM != null && Number.isFinite(fix.accuracyM) ? fix.accuracyM : null,
    rawHeading: isUsableCourse(rawHeading) ? rawHeading : null,
    heading: committed.heading,
    headingAccuracy:
      fix.headingAccuracyDeg != null && Number.isFinite(fix.headingAccuracyDeg)
        ? fix.headingAccuracyDeg
        : null,
    headingQuality: committed.headingQuality,
    headingState: committed.headingState,
    lastValidHeading: committed.lastValidHeading,
    headingReason: committed.headingReason,
    isSnapped: tick.snapped,
    gpsState: "ACTIVE",
    routeState: classifyRouteState(engine, tick.confirmedOffRoute, hasRoute),
    routeGeneration: engine.routeGeneration,
    routeProgress: tick.routeProgressM,
    maneuverState: tick.maneuver,
    lastFixAt: fix.nowMs,
    lastValidHeadingAt: committed.lastValidHeadingAt,
    remainingDistM: tick.remainingDistM,
    remainingMin: tick.remainingMin,
    distToManeuverM: tick.distToManeuverM,
    guidanceStale: tick.guidanceStale,
    confirmedOffRoute: tick.confirmedOffRoute,
  };
}

/** Route binden — Heading nicht aus Route-/Ziel-Bearing setzen. */
export function commitNavigationRouteBound(
  prev: NavigationState,
  opts: {
    generation: number;
    progressM: number;
    display: LatLon;
    heading: number | null;
    isSnapped: boolean;
    remainingDistM: number;
    remainingMin: number;
  },
): NavigationState {
  return {
    ...prev,
    filteredPosition: opts.display,
    snappedPosition: opts.isSnapped ? opts.display : null,
    displayPosition: opts.display,
    heading: prev.heading,
    headingQuality: prev.headingQuality,
    headingState: prev.headingState,
    lastValidHeading: prev.lastValidHeading,
    headingReason: prev.headingReason,
    isSnapped: opts.isSnapped,
    routeState: "navigating",
    routeGeneration: opts.generation,
    routeProgress: opts.progressM,
    maneuverState: null,
    guidanceStale: false,
    confirmedOffRoute: false,
    remainingDistM: opts.remainingDistM,
    remainingMin: opts.remainingMin,
    distToManeuverM: 0,
    lastValidHeadingAt: prev.lastValidHeadingAt,
  };
}

export function commitNavigationRerouteFlag(
  prev: NavigationState,
  inFlight: boolean,
): NavigationState {
  return {
    ...prev,
    routeState: inFlight ? "rerouting" : prev.routeState === "rerouting" ? "navigating" : prev.routeState,
    guidanceStale: inFlight,
  };
}

export function headingTransitionChanged(prev: NavigationState, next: NavigationState): boolean {
  return prev.headingState !== next.headingState || prev.headingReason !== next.headingReason;
}
