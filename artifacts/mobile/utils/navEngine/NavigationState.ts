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
  NavEngineOutput,
  NavEngineState,
  NavFix,
  NavigationState,
  NavGpsStateKind,
  NavHeadingDiagReason,
  NavHeadingQualityKind,
  NavHeadingStateKind,
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
  output: NavEngineOutput,
  hasRoute: boolean,
): NavRouteRuntimeKind {
  if (engine.rerouteInFlight) return "rerouting";
  if (output.confirmedOffRoute) return "off_route";
  if (hasRoute) return "navigating";
  return "idle";
}

export function commitNavigationFromTick(
  prev: NavigationState,
  fix: NavFix,
  engine: NavEngineState,
  output: NavEngineOutput,
  hasRoute: boolean,
  opts?: { movementBearingDeg?: number | null },
): NavigationState {
  const rawHeading =
    fix.courseDeg != null && Number.isFinite(fix.courseDeg) ? fix.courseDeg : null;
  const committed = commitHeadingQuality(prev, {
    rawHeading,
    speed: output.speedMps,
    movementBearingDeg: opts?.movementBearingDeg ?? null,
    nowMs: fix.nowMs,
  });

  return {
    rawPosition: { lat: fix.lat, lon: fix.lon },
    filteredPosition: output.filtered,
    snappedPosition: output.snapped ? output.display : null,
    displayPosition: output.display,
    speed: output.speedMps,
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
    isSnapped: output.snapped,
    gpsState: "ACTIVE",
    routeState: classifyRouteState(engine, output, hasRoute),
    routeGeneration: engine.routeGeneration,
    routeProgress: output.routeProgressM,
    maneuverState: output.maneuver,
    lastFixAt: fix.nowMs,
    lastValidHeadingAt: committed.lastValidHeadingAt,
    remainingDistM: output.remainingDistM,
    remainingMin: output.remainingMin,
    distToManeuverM: output.distToManeuverM,
    guidanceStale: output.guidanceStale,
    confirmedOffRoute: output.confirmedOffRoute,
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

/** Recenter/bootstrap → denselben Store. Kein Ziel-/Step-Bearing. */
export function commitNavigationFromLegacyPose(
  prev: NavigationState,
  pose: {
    lat: number;
    lon: number;
    heading: number | null;
    speedMps: number | null;
    rawLat: number;
    rawLon: number;
    courseDeg?: number | null;
    movementBearingDeg?: number | null;
    nowMs: number;
    isSnapped?: boolean;
    accuracy?: number | null;
    headingAccuracy?: number | null;
  },
): NavigationState {
  const rawHeading =
    pose.courseDeg != null && Number.isFinite(pose.courseDeg) ? pose.courseDeg : null;
  const committed = commitHeadingQuality(prev, {
    rawHeading,
    speed: pose.speedMps,
    movementBearingDeg: pose.movementBearingDeg ?? null,
    nowMs: pose.nowMs,
  });
  const display = { lat: pose.lat, lon: pose.lon };
  const snapped = !!pose.isSnapped;
  return {
    ...prev,
    rawPosition: { lat: pose.rawLat, lon: pose.rawLon },
    filteredPosition: display,
    snappedPosition: snapped ? display : prev.snappedPosition,
    displayPosition: display,
    speed: pose.speedMps,
    accuracy: pose.accuracy ?? prev.accuracy,
    rawHeading: isUsableCourse(rawHeading) ? rawHeading : null,
    heading: committed.heading,
    headingAccuracy: pose.headingAccuracy ?? prev.headingAccuracy,
    headingQuality: committed.headingQuality,
    headingState: committed.headingState,
    lastValidHeading: committed.lastValidHeading,
    headingReason: committed.headingReason,
    isSnapped: snapped,
    gpsState: "ACTIVE" as NavGpsStateKind,
    lastFixAt: pose.nowMs,
    lastValidHeadingAt: committed.lastValidHeadingAt,
  };
}

export type NavCompatMirrors = {
  pose: { lat: number; lon: number; heading: number | null };
  lastRawFix: { lat: number; lon: number; atMs: number } | null;
  routeProgressM: number;
  routeGeneration: number;
};

export function mirrorsFromNavigationState(nav: NavigationState): NavCompatMirrors {
  const display = nav.displayPosition;
  return {
    pose: {
      lat: display?.lat ?? 0,
      lon: display?.lon ?? 0,
      heading: nav.heading,
    },
    lastRawFix:
      nav.rawPosition && nav.lastFixAt != null
        ? { lat: nav.rawPosition.lat, lon: nav.rawPosition.lon, atMs: nav.lastFixAt }
        : null,
    routeProgressM: nav.routeProgress,
    routeGeneration: nav.routeGeneration,
  };
}

export function headingTransitionChanged(prev: NavigationState, next: NavigationState): boolean {
  return prev.headingState !== next.headingState || prev.headingReason !== next.headingReason;
}

/** Test/API-Alias: gleiche Policy wie commitHeadingQuality. */
export function resolveCommittedNavHeading(args: {
  rawCourseDeg: number;
  speedMps: number;
  tickHeading: number | null;
  prevHeading: number | null;
  prevHeadingState: NavHeadingStateKind;
  lastValidHeading: number | null;
  lastValidHeadingAt: number | null;
  nowMs: number;
}): NavHeadingCommitResult {
  return commitHeadingQuality(
    {
      heading: args.prevHeading,
      lastValidHeading: args.lastValidHeading,
      lastValidHeadingAt: args.lastValidHeadingAt,
    },
    { rawHeading: args.rawCourseDeg, speed: args.speedMps, nowMs: args.nowMs, movementBearingDeg: null },
  );
}
