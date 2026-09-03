/**
 * OffRouteEngine (Schritt 5) — Off-Route nur gegen die Rest-Route + Signal-Kombi.
 *
 * Datenfluss:
 * - Lateral: Querabstand zur Rest-Route ab committedProgress (nicht volle Polyline,
 *   nicht gesnappte Display-Pose).
 * - Progress-Stall: Fahren ohne Fortschritt (Parallelstraße / Ausfahrt).
 * - Heading: unterstützend — allein kein Reroute.
 * - Generation: stale Snapshot → keine Off-Route-Bestätigung auf alter Geometrie.
 *
 * Threshold-Konstanten bleiben die bestehenden (kein Tuning auf Verdacht).
 */

import { shortestRotationDelta } from "../liveDriverMarkerMotion";
import { isMovingForNavHeading, isUsableCourse } from "../navHeadingSmoother";
import { distanceToForwardPolylineM } from "../routeRemainingAlongPolyline";
import type { LatLon } from "./types";

/** Querabstand über dem die Position als abseits gilt (Rest-Route). */
export const NAV_OFF_ROUTE_THRESHOLD_M = 12;

/** Mind. so viele aufeinanderfolgende Off-Fixes. */
export const NAV_OFF_ROUTE_CONFIRM_FIXES = 2;

/** Oder so lange durchgehend abseits (ms). */
export const NAV_OFF_ROUTE_CONFIRM_MS = 800;

/**
 * Kurs weicht stark von Rest-Route ab — nur in Kombination mit Lateral/Stall.
 */
export const NAV_OFF_ROUTE_HEADING_DELTA_DEG = 60;

/** Heading-Mismatch Beobachtungsfenster (ms) — allein kein Force. */
export const NAV_OFF_ROUTE_HEADING_CONFIRM_MS = 1000;

/** Sehr große Kursdrehung (≈ U-Turn). */
export const NAV_OFF_ROUTE_UTURN_DELTA_DEG = 120;
export const NAV_OFF_ROUTE_UTURN_CONFIRM_MS = 600;

/** Nur bei dieser Mindest-Speed Heading werten. */
export const NAV_OFF_ROUTE_HEADING_MIN_SPEED_MPS = 1.8;

/**
 * Fahrend, aber Fortschritt entlang der Route stockt (Parallelstraße / Ausfahrt).
 */
export const NAV_OFF_ROUTE_STALL_CONFIRM_MS = 2_500;
export const NAV_OFF_ROUTE_STALL_MIN_SPEED_MPS = 3.0;
export const NAV_OFF_ROUTE_STALL_MIN_PROGRESS_M = 8;

/** Wie weit hinter dem committed Progress die Rest-Route noch mitzählt (GPS-Jitter). */
export const NAV_ROUTE_PROGRESS_BACKTRACK_M = 35;

/** Fortschritt nur übernehmen, wenn Querabstand darunter (RouteProgressEngine). */
export const NAV_ROUTE_PROGRESS_MAX_LATERAL_M = 20;

export type OffRouteTrackerState = {
  consecutiveOffFixes: number;
  offSinceMs: number | null;
  headingDisagreeSinceMs: number | null;
  stallAnchorProgressM: number | null;
  stallSinceMs: number | null;
};

export function createOffRouteTrackerState(): OffRouteTrackerState {
  return {
    consecutiveOffFixes: 0,
    offSinceMs: null,
    headingDisagreeSinceMs: null,
    stallAnchorProgressM: null,
    stallSinceMs: null,
  };
}

/**
 * Lateral zur **Rest-Route** ab committed Progress — immer von der ungefilterten
 * Match-Pose (`filtered` / Roh-GPS nach Filter), nie von der gesnappten Display-Pose.
 */
export function measureRestRouteLateralM(
  polyline: LatLon[],
  filteredAt: LatLon,
  committedProgressM: number,
): number | null {
  if (polyline.length < 2) return null;
  const fromProg = Math.max(0, committedProgressM - NAV_ROUTE_PROGRESS_BACKTRACK_M);
  return distanceToForwardPolylineM(polyline, filteredAt, fromProg);
}

/**
 * Effektive Off-Route-Distanz + Signal-Flags.
 * Heading allein hebt die Distanz **nicht** über die Schwelle.
 */
export function effectiveOffRouteDistanceM(opts: {
  forwardDistM: number | null;
  committedProgressM: number;
  courseDeg?: number | null;
  routeBearingDeg?: number | null;
  speedMps?: number | null;
  nowMs: number;
  state: OffRouteTrackerState;
  thresholdM?: number;
}): {
  distanceM: number | null;
  state: OffRouteTrackerState;
  headingDisagree: boolean;
  headingSustained: boolean;
  stallForced: boolean;
  comboForced: boolean;
} {
  const threshold = opts.thresholdM ?? NAV_OFF_ROUTE_THRESHOLD_M;
  const speed =
    opts.speedMps != null && Number.isFinite(opts.speedMps) ? opts.speedMps : null;

  const movingForHeading =
    speed != null &&
    speed >= NAV_OFF_ROUTE_HEADING_MIN_SPEED_MPS &&
    isMovingForNavHeading(speed);

  const courseOk = isUsableCourse(opts.courseDeg);
  const routeOk =
    opts.routeBearingDeg != null && Number.isFinite(opts.routeBearingDeg);
  const headingDelta =
    movingForHeading && courseOk && routeOk
      ? Math.abs(shortestRotationDelta(opts.courseDeg!, opts.routeBearingDeg!))
      : 0;
  const disagree = headingDelta >= NAV_OFF_ROUTE_HEADING_DELTA_DEG;
  const uturn = headingDelta >= NAV_OFF_ROUTE_UTURN_DELTA_DEG;
  const headingConfirmMs = uturn
    ? NAV_OFF_ROUTE_UTURN_CONFIRM_MS
    : NAV_OFF_ROUTE_HEADING_CONFIRM_MS;

  let headingDisagreeSinceMs = opts.state.headingDisagreeSinceMs;
  if (disagree) {
    headingDisagreeSinceMs = headingDisagreeSinceMs ?? opts.nowMs;
  } else {
    headingDisagreeSinceMs = null;
  }

  const headingSustained =
    headingDisagreeSinceMs != null &&
    opts.nowMs - headingDisagreeSinceMs >= headingConfirmMs;

  // Progress-Stall: fahren ohne Fortschritt auf der Route
  let stallAnchorProgressM = opts.state.stallAnchorProgressM;
  let stallSinceMs = opts.state.stallSinceMs;
  const movingForStall =
    speed != null && speed >= NAV_OFF_ROUTE_STALL_MIN_SPEED_MPS && isMovingForNavHeading(speed);

  if (!movingForStall) {
    stallAnchorProgressM = null;
    stallSinceMs = null;
  } else if (stallAnchorProgressM == null || stallSinceMs == null) {
    stallAnchorProgressM = opts.committedProgressM;
    stallSinceMs = opts.nowMs;
  } else if (
    opts.committedProgressM - stallAnchorProgressM >=
    NAV_OFF_ROUTE_STALL_MIN_PROGRESS_M
  ) {
    stallAnchorProgressM = opts.committedProgressM;
    stallSinceMs = opts.nowMs;
  }

  const stallForced =
    movingForStall &&
    stallSinceMs != null &&
    opts.nowMs - stallSinceMs >= NAV_OFF_ROUTE_STALL_CONFIRM_MS;

  const lateralOff =
    opts.forwardDistM != null &&
    Number.isFinite(opts.forwardDistM) &&
    opts.forwardDistM > threshold;

  /**
   * Kombi (kein Heading-Alone):
   * - Stall allein (Fahren ohne Progress) — bereits Mehrsignal
   * - Heading sustained + Lateral abseits
   * - Heading sustained + Stall
   */
  const comboForced =
    stallForced || (headingSustained && (lateralOff || stallForced));

  let distanceM = opts.forwardDistM;
  if (comboForced) {
    const base = distanceM != null && Number.isFinite(distanceM) ? distanceM : 0;
    distanceM = Math.max(base, threshold + 5);
  }

  return {
    distanceM,
    state: {
      ...opts.state,
      headingDisagreeSinceMs,
      stallAnchorProgressM,
      stallSinceMs,
    },
    headingDisagree: disagree,
    headingSustained,
    stallForced,
    comboForced,
  };
}

/**
 * Ein GPS-Sample: on-route → Tracker reset; off-route → zählen.
 * `confirmedOffRoute` nur bei Bestätigung (Fixes ODER Dauer).
 */
export function noteOffRouteSample(
  state: OffRouteTrackerState,
  distanceToRouteM: number | null,
  nowMs: number,
  thresholdM: number = NAV_OFF_ROUTE_THRESHOLD_M,
): { state: OffRouteTrackerState; confirmedOffRoute: boolean } {
  if (
    distanceToRouteM == null ||
    !Number.isFinite(distanceToRouteM) ||
    distanceToRouteM <= thresholdM
  ) {
    return {
      state: {
        ...createOffRouteTrackerState(),
        headingDisagreeSinceMs: state.headingDisagreeSinceMs,
        stallAnchorProgressM: state.stallAnchorProgressM,
        stallSinceMs: state.stallSinceMs,
      },
      confirmedOffRoute: false,
    };
  }

  const consecutiveOffFixes = state.consecutiveOffFixes + 1;
  const offSinceMs = state.offSinceMs ?? nowMs;
  const next: OffRouteTrackerState = {
    consecutiveOffFixes,
    offSinceMs,
    headingDisagreeSinceMs: state.headingDisagreeSinceMs,
    stallAnchorProgressM: state.stallAnchorProgressM,
    stallSinceMs: state.stallSinceMs,
  };
  const byFixes = consecutiveOffFixes >= NAV_OFF_ROUTE_CONFIRM_FIXES;
  const byTime = nowMs - offSinceMs >= NAV_OFF_ROUTE_CONFIRM_MS;
  return { state: next, confirmedOffRoute: byFixes || byTime };
}

/** Kombi: Rest-Route-Lateral + Stall/Heading-Kombi + Bestätigung. */
export function evaluateNavOffRouteSample(opts: {
  state: OffRouteTrackerState;
  nowMs: number;
  forwardDistM: number | null;
  committedProgressM: number;
  courseDeg?: number | null;
  routeBearingDeg?: number | null;
  speedMps?: number | null;
  /** Wenn Snapshot älter als gebundene Generation: keine Bestätigung. */
  routeGeneration?: number;
  snapshotGeneration?: number;
}): {
  state: OffRouteTrackerState;
  confirmedOffRoute: boolean;
  distanceM: number | null;
  headingDisagree: boolean;
  headingSustained: boolean;
  stallForced: boolean;
  comboForced: boolean;
  /** @deprecated Alias für Tests — war früher headingForced (Alone). Jetzt immer false. */
  headingForced: boolean;
} {
  const staleGeneration =
    (opts.routeGeneration ?? 0) > 0 &&
    (opts.snapshotGeneration ?? 0) > 0 &&
    (opts.snapshotGeneration as number) < (opts.routeGeneration as number);

  if (staleGeneration) {
    return {
      state: opts.state,
      confirmedOffRoute: false,
      distanceM: opts.forwardDistM,
      headingDisagree: false,
      headingSustained: false,
      stallForced: false,
      comboForced: false,
      headingForced: false,
    };
  }

  const eff = effectiveOffRouteDistanceM({
    forwardDistM: opts.forwardDistM,
    committedProgressM: opts.committedProgressM,
    courseDeg: opts.courseDeg,
    routeBearingDeg: opts.routeBearingDeg,
    speedMps: opts.speedMps,
    nowMs: opts.nowMs,
    state: opts.state,
  });
  const noted = noteOffRouteSample(eff.state, eff.distanceM, opts.nowMs);
  return {
    state: noted.state,
    confirmedOffRoute: noted.confirmedOffRoute,
    distanceM: eff.distanceM,
    headingDisagree: eff.headingDisagree,
    headingSustained: eff.headingSustained,
    stallForced: eff.stallForced,
    comboForced: eff.comboForced,
    /** Heading allein erzwingt keinen Off-Route mehr. */
    headingForced: false,
  };
}
