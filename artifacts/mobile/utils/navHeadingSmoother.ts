/**
 * Fahrer-Navi Kamera-Heading: Speed-Gate + EMA + Deadband + Rate-Limit.
 * Kein Snap-to-Road / Polyline-Tangente (später optional).
 */

import {
  normalizeHeadingDegrees,
  shortestRotationDelta,
} from "./liveDriverMarkerMotion";

/** Unterhalb: stehend/Stau — Kurs oft unbrauchbar → Heading halten. */
export const NAV_HEADING_MOVING_SPEED_MPS = 2;

/** Mikro-Jitter unter diesem Winkel nicht übernehmen. */
export const NAV_HEADING_DEADBAND_DEG = 6;

/** EMA-Gewicht auf dem Shortest-Path-Delta (0…1). */
export const NAV_HEADING_EMA_ALPHA = 0.22;

/** Max. Heading-Änderung pro Sekunde (°/s). */
export const NAV_HEADING_MAX_RATE_DEG_PER_S = 55;

/** Kamera-Follow Mindestabstand (C). */
export const NAV_CAMERA_FOLLOW_MIN_INTERVAL_MS = 450;

/** animateCamera-Dauer bei Follow — nahe am Throttle, weniger Überlappung. */
export const NAV_CAMERA_FOLLOW_DURATION_MS = 420;

export type NavHeadingSmootherState = {
  heading: number | null;
  lastUpdateMs: number | null;
};

export function createNavHeadingSmootherState(): NavHeadingSmootherState {
  return { heading: null, lastUpdateMs: null };
}

/** GPS-Kurs: gültig 0…360; -1 / null = ungültig (expo / CoreLocation). */
export function isUsableCourse(heading?: number | null): heading is number {
  return heading != null && Number.isFinite(heading) && heading >= 0 && heading <= 360;
}

export function isMovingForNavHeading(speedMps?: number | null): boolean {
  return (
    speedMps != null &&
    Number.isFinite(speedMps) &&
    speedMps >= NAV_HEADING_MOVING_SPEED_MPS
  );
}

/**
 * Roh-Zielheading wählen (B):
 * - fahrend: GPS-Kurs, sonst Fallback (Step/Ziel)
 * - stehend / Speed unbekannt: gehaltenes Heading, sonst Kurs, sonst Fallback
 */
export function pickNavHeadingRaw(input: {
  speedMps?: number | null;
  courseDeg?: number | null;
  fallbackBearingDeg?: number | null;
  heldHeadingDeg?: number | null;
}): number | null {
  const course = isUsableCourse(input.courseDeg) ? normalizeHeadingDegrees(input.courseDeg) : null;
  const fallback =
    input.fallbackBearingDeg != null && Number.isFinite(input.fallbackBearingDeg)
      ? normalizeHeadingDegrees(input.fallbackBearingDeg)
      : null;
  const held =
    input.heldHeadingDeg != null && Number.isFinite(input.heldHeadingDeg)
      ? normalizeHeadingDegrees(input.heldHeadingDeg)
      : null;

  if (isMovingForNavHeading(input.speedMps)) {
    return course ?? fallback ?? held;
  }

  // Stehend / Ampel / Speed unbekannt: nicht auf Jitter-Kurs springen.
  if (held != null) return held;
  return course ?? fallback;
}

/**
 * A: Deadband → EMA → Rate-Limit. Erstes Sample snappt.
 */
export function applyNavHeadingSmooth(
  state: NavHeadingSmootherState,
  rawDeg: number | null,
  nowMs: number,
): { state: NavHeadingSmootherState; heading: number | null } {
  if (rawDeg == null || !Number.isFinite(rawDeg)) {
    return { state, heading: state.heading };
  }

  const target = normalizeHeadingDegrees(rawDeg);

  if (state.heading == null || state.lastUpdateMs == null) {
    const next = { heading: target, lastUpdateMs: nowMs };
    return { state: next, heading: target };
  }

  const delta = shortestRotationDelta(state.heading, target);
  if (Math.abs(delta) < NAV_HEADING_DEADBAND_DEG) {
    return {
      state: { ...state, lastUpdateMs: nowMs },
      heading: state.heading,
    };
  }

  const dtSec = Math.max(0.016, (nowMs - state.lastUpdateMs) / 1000);
  let stepped = delta * NAV_HEADING_EMA_ALPHA;
  const maxStep = NAV_HEADING_MAX_RATE_DEG_PER_S * dtSec;
  if (stepped > maxStep) stepped = maxStep;
  if (stepped < -maxStep) stepped = -maxStep;

  const heading = normalizeHeadingDegrees(state.heading + stepped);
  return {
    state: { heading, lastUpdateMs: nowMs },
    heading,
  };
}

/** Ein Tick: Quelle wählen + glätten. */
export function tickNavHeading(
  state: NavHeadingSmootherState,
  input: {
    speedMps?: number | null;
    courseDeg?: number | null;
    fallbackBearingDeg?: number | null;
    nowMs?: number;
  },
): { state: NavHeadingSmootherState; heading: number | null } {
  const raw = pickNavHeadingRaw({
    speedMps: input.speedMps,
    courseDeg: input.courseDeg,
    fallbackBearingDeg: input.fallbackBearingDeg,
    heldHeadingDeg: state.heading,
  });
  return applyNavHeadingSmooth(state, raw, input.nowMs ?? Date.now());
}
