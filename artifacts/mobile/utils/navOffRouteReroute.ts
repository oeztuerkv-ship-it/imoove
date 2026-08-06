/**
 * Off-Route-Bestätigung + Reroute-Cooldown (Fahrer-Navi MVP).
 * Distanz: bevorzugt `distanceToForwardPolylineM` (Rest-Route, nicht Abgefahrenes).
 */

import { shortestRotationDelta } from "./liveDriverMarkerMotion";
import { isMovingForNavHeading, isUsableCourse } from "./navHeadingSmoother";

/** Querabstand über dem die Position als abseits gilt (Rest-Route). */
export const NAV_OFF_ROUTE_THRESHOLD_M = 15;

/** Mind. so viele aufeinanderfolgende Off-Fixes. */
export const NAV_OFF_ROUTE_CONFIRM_FIXES = 2;

/** Oder so lange durchgehend abseits (ms). */
export const NAV_OFF_ROUTE_CONFIRM_MS = 900;

/** Mindestabstand zwischen Reroute-Versuchen (auch nach Fehler). */
export const NAV_REROUTE_COOLDOWN_MS = 3_500;

/**
 * Kurs weicht stark von Rest-Route ab → auch bei kleinem Querabstand Off-Route
 * (z. B. Falschabbiegen parallel / weiter geradeaus an der Kreuzung).
 */
export const NAV_OFF_ROUTE_HEADING_DELTA_DEG = 65;

/** Heading-Mismatch muss so lange anhalten (ms). */
export const NAV_OFF_ROUTE_HEADING_CONFIRM_MS = 1200;

/** Nur bei dieser Mindest-Speed Heading-Mismatch werten. */
export const NAV_OFF_ROUTE_HEADING_MIN_SPEED_MPS = 2.0;

/** Wie weit hinter dem committed Progress die Rest-Route noch mitzählt (GPS-Jitter). */
export const NAV_ROUTE_PROGRESS_BACKTRACK_M = 40;

export type OffRouteTrackerState = {
  consecutiveOffFixes: number;
  offSinceMs: number | null;
  headingDisagreeSinceMs: number | null;
};

export function createOffRouteTrackerState(): OffRouteTrackerState {
  return { consecutiveOffFixes: 0, offSinceMs: null, headingDisagreeSinceMs: null };
}

/**
 * Effektive Off-Route-Distanz: Forward-Querabstand, ggf. angehoben bei
 * anhaltendem Heading-Mismatch zur Rest-Route.
 */
export function effectiveOffRouteDistanceM(opts: {
  forwardDistM: number | null;
  courseDeg?: number | null;
  routeBearingDeg?: number | null;
  speedMps?: number | null;
  nowMs: number;
  state: OffRouteTrackerState;
  thresholdM?: number;
  headingDeltaDeg?: number;
  headingConfirmMs?: number;
}): { distanceM: number | null; state: OffRouteTrackerState; headingForced: boolean } {
  const threshold = opts.thresholdM ?? NAV_OFF_ROUTE_THRESHOLD_M;
  const maxDelta = opts.headingDeltaDeg ?? NAV_OFF_ROUTE_HEADING_DELTA_DEG;
  const confirmMs = opts.headingConfirmMs ?? NAV_OFF_ROUTE_HEADING_CONFIRM_MS;

  const moving =
    opts.speedMps != null &&
    Number.isFinite(opts.speedMps) &&
    opts.speedMps >= NAV_OFF_ROUTE_HEADING_MIN_SPEED_MPS &&
    isMovingForNavHeading(opts.speedMps);

  const courseOk = isUsableCourse(opts.courseDeg);
  const routeOk =
    opts.routeBearingDeg != null && Number.isFinite(opts.routeBearingDeg);
  const disagree =
    moving &&
    courseOk &&
    routeOk &&
    Math.abs(shortestRotationDelta(opts.courseDeg!, opts.routeBearingDeg!)) >= maxDelta;

  let headingDisagreeSinceMs = opts.state.headingDisagreeSinceMs;
  if (disagree) {
    headingDisagreeSinceMs = headingDisagreeSinceMs ?? opts.nowMs;
  } else {
    headingDisagreeSinceMs = null;
  }

  const headingForced =
    headingDisagreeSinceMs != null && opts.nowMs - headingDisagreeSinceMs >= confirmMs;

  let distanceM = opts.forwardDistM;
  if (headingForced) {
    const base = distanceM != null && Number.isFinite(distanceM) ? distanceM : 0;
    distanceM = Math.max(base, threshold + 5);
  }

  return {
    distanceM,
    state: { ...opts.state, headingDisagreeSinceMs },
    headingForced,
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
        // Heading-Disagree-Fenster behalten, sonst flackert Force bei Grenzwerten
        headingDisagreeSinceMs: state.headingDisagreeSinceMs,
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
  };
  const byFixes = consecutiveOffFixes >= NAV_OFF_ROUTE_CONFIRM_FIXES;
  const byTime = nowMs - offSinceMs >= NAV_OFF_ROUTE_CONFIRM_MS;
  return { state: next, confirmedOffRoute: byFixes || byTime };
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
