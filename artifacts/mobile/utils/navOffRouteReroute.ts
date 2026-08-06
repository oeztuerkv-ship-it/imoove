/**
 * Off-Route-Bestätigung + Reroute-Cooldown (Fahrer-Navi MVP).
 * Distanz: bevorzugt `distanceToForwardPolylineM` (Rest-Route, nicht Abgefahrenes).
 *
 * Szenarien (Selftest):
 * 1. Früh falsch abbiegen (30–50 m vor Manöver)
 * 2. Parallel auf Nebenstraße (gleicher Kurs)
 * 3. 180°-Wende
 * 4. Kreisverkehr falsche Ausfahrt
 * 5. Autobahnausfahrt verpasst
 * 6. Kurz halten, dann andere Richtung
 */

import { shortestRotationDelta } from "./liveDriverMarkerMotion";
import { isMovingForNavHeading, isUsableCourse } from "./navHeadingSmoother";

/** Querabstand über dem die Position als abseits gilt (Rest-Route). */
export const NAV_OFF_ROUTE_THRESHOLD_M = 12;

/** Mind. so viele aufeinanderfolgende Off-Fixes. */
export const NAV_OFF_ROUTE_CONFIRM_FIXES = 2;

/** Oder so lange durchgehend abseits (ms). */
export const NAV_OFF_ROUTE_CONFIRM_MS = 800;

/** Mindestabstand zwischen Reroute-Versuchen (auch nach Fehler). */
export const NAV_REROUTE_COOLDOWN_MS = 3_000;

/**
 * Kurs weicht stark von Rest-Route ab → auch bei kleinem Querabstand Off-Route
 * (180°-Wende, falsche Kreisverkehr-Ausfahrt, nach Halt andere Richtung).
 */
export const NAV_OFF_ROUTE_HEADING_DELTA_DEG = 60;

/** Heading-Mismatch Standard-Bestätigung (ms). */
export const NAV_OFF_ROUTE_HEADING_CONFIRM_MS = 1000;

/** Sehr große Kursdrehung (≈ U-Turn) — schneller bestätigen. */
export const NAV_OFF_ROUTE_UTURN_DELTA_DEG = 120;
export const NAV_OFF_ROUTE_UTURN_CONFIRM_MS = 600;

/** Nur bei dieser Mindest-Speed Heading-Mismatch werten. */
export const NAV_OFF_ROUTE_HEADING_MIN_SPEED_MPS = 1.8;

/**
 * Fahrend, aber Fortschritt entlang der Route stockt (Parallelstraße / Ausfahrt verpasst).
 * Progress darf in dem Fenster mind. so viele Meter zunehmen — sonst Off-Route.
 */
export const NAV_OFF_ROUTE_STALL_CONFIRM_MS = 2_500;
export const NAV_OFF_ROUTE_STALL_MIN_SPEED_MPS = 3.0;
export const NAV_OFF_ROUTE_STALL_MIN_PROGRESS_M = 8;

/** Wie weit hinter dem committed Progress die Rest-Route noch mitzählt (GPS-Jitter). */
export const NAV_ROUTE_PROGRESS_BACKTRACK_M = 35;

/** Fortschritt nur übernehmen, wenn Querabstand zur (vollen) Projektion darunter. */
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
 * Effektive Off-Route-Distanz: Forward-Querabstand, ggf. angehoben bei
 * Heading-Mismatch oder Progress-Stall.
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
  headingForced: boolean;
  stallForced: boolean;
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

  const headingForced =
    headingDisagreeSinceMs != null &&
    opts.nowMs - headingDisagreeSinceMs >= headingConfirmMs;

  // Progress-Stall: fahren ohne Fortschritt auf der Route (Parallel / Ausfahrt verpasst)
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

  let distanceM = opts.forwardDistM;
  if (headingForced || stallForced) {
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
    headingForced,
    stallForced,
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
  if (distanceToRouteM == null || !Number.isFinite(distanceToRouteM) || distanceToRouteM <= thresholdM) {
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

/** Kombi: effective Distanz + Bestätigung (für Navi-GPS-Tick und Selftests). */
export function evaluateNavOffRouteSample(opts: {
  state: OffRouteTrackerState;
  nowMs: number;
  forwardDistM: number | null;
  committedProgressM: number;
  courseDeg?: number | null;
  routeBearingDeg?: number | null;
  speedMps?: number | null;
}): {
  state: OffRouteTrackerState;
  confirmedOffRoute: boolean;
  distanceM: number | null;
  headingForced: boolean;
  stallForced: boolean;
} {
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
    headingForced: eff.headingForced,
    stallForced: eff.stallForced,
  };
}

export function canStartReroute(opts: {
  inFlight: boolean;
  lastRerouteAtMs: number | null;
  nowMs: number;
  cooldownMs?: number;
}): boolean {
  if (opts.inFlight) return false;
  const cooldown = opts.cooldownMs ?? NAV_REROUTE_COOLDOWN_MS;
  if (opts.lastRerouteAtMs != null && opts.nowMs - opts.lastRerouteAtMs < cooldown) {
    return false;
  }
  return true;
}
