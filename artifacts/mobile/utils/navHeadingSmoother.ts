/**
 * Fahrer-Navi Kamera-Heading: Speed-Gate + EMA + Deadband + Rate-Limit.
 *
 * Branchenüblich (Apple/Mapbox/Locus u. a.):
 * - Auto: **GPS-Kurs / Routenrichtung**, nicht Magnetometer (im Fahrzeug oft unbrauchbar).
 * - Kurs nur bei klarer Fahrt vertrauenswürdig; bei niedriger Speed halten.
 * - Mit bekannter Route: **Polyline-Tangente** ist stabiler als urbaner GPS-Kurs.
 *
 * Quelle (fahrend, mit Route): Polyline → Kurs (nur wenn er zur Poly passt) → Bewegung → halten.
 * Ohne Route: Kurs (bei genug Speed) → Bewegung → halten. Kein Ziel-Bearing während Fahrt
 * (sonst „sucht“ der Pfeil den Waypoint und dreht).
 */

import {
  normalizeHeadingDegrees,
  shortestRotationDelta,
} from "./liveDriverMarkerMotion";

/** Unterhalb: stehend/Stau — Kurs oft unbrauchbar → Heading halten. */
export const NAV_HEADING_MOVING_SPEED_MPS = 1.4;

/**
 * GPS-Kurs erst ab dieser Speed vertrauen (~9 km/h).
 * Darunter liefert CoreLocation oft -1 oder „gültige“ aber springende Werte.
 */
export const NAV_HEADING_TRUST_COURSE_SPEED_MPS = 2.5;

/** Kurs darf Polyline nur überschreiben, wenn er ungefähr in dieselbe Richtung zeigt. */
export const NAV_HEADING_COURSE_POLY_AGREE_DEG = 70;

/**
 * Polyline-Segment-Sprung (z. B. falsche Kante): > dieser Δ zum gehaltenen Heading
 * → Poly für diesen Tick verwerfen (verhindert 180°-Flip-Flop).
 */
export const NAV_HEADING_POLY_FLIP_REJECT_DEG = 135;

/** Mikro-Jitter unter diesem Winkel nicht übernehmen. */
export const NAV_HEADING_DEADBAND_DEG = 5;

/** EMA-Gewicht auf dem Shortest-Path-Delta (0…1). */
export const NAV_HEADING_EMA_ALPHA = 0.18;

/** Max. Heading-Änderung pro Sekunde (°/s) — weichere Kurven. */
export const NAV_HEADING_MAX_RATE_DEG_PER_S = 40;

/** Kamera-Follow Mindestabstand. */
export const NAV_CAMERA_FOLLOW_MIN_INTERVAL_MS = 550;

/** animateCamera-Dauer bei Follow — unter Follow-Intervall, weniger Überlappung. */
export const NAV_CAMERA_FOLLOW_DURATION_MS = 480;

/** Position-EMA (0…1); höher = reaktiver. */
export const NAV_POSITION_EMA_ALPHA = 0.32;

/** Min. Kamera-Update: Position (m) / Heading (°). */
export const NAV_CAMERA_MIN_MOVE_M = 1.2;
export const NAV_CAMERA_MIN_HEADING_DELTA_DEG = 3.5;

export type NavHeadingSmootherState = {
  heading: number | null;
  lastUpdateMs: number | null;
};

export type NavPositionSmootherState = {
  lat: number | null;
  lon: number | null;
};

export function createNavHeadingSmootherState(): NavHeadingSmootherState {
  return { heading: null, lastUpdateMs: null };
}

export function createNavPositionSmootherState(): NavPositionSmootherState {
  return { lat: null, lon: null };
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

export function headingsAgreeDeg(a: number, b: number, maxDeltaDeg: number): boolean {
  return Math.abs(shortestRotationDelta(a, b)) <= maxDeltaDeg;
}

/**
 * Roh-Zielheading:
 * - fahrend + Route: Polyline zuerst; GPS-Kurs nur wenn er zur Poly passt und Speed hoch genug
 * - fahrend ohne Route: Kurs (Speed-Gate) → Bewegung → halten (kein Ziel-Fallback)
 * - stehend: gehaltenes Heading; Bootstrap poly/kurs/fallback
 */
export function pickNavHeadingRaw(input: {
  speedMps?: number | null;
  courseDeg?: number | null;
  polylineBearingDeg?: number | null;
  movementBearingDeg?: number | null;
  fallbackBearingDeg?: number | null;
  heldHeadingDeg?: number | null;
}): number | null {
  const course = isUsableCourse(input.courseDeg) ? normalizeHeadingDegrees(input.courseDeg) : null;
  let poly =
    input.polylineBearingDeg != null && Number.isFinite(input.polylineBearingDeg)
      ? normalizeHeadingDegrees(input.polylineBearingDeg)
      : null;
  const movement =
    input.movementBearingDeg != null && Number.isFinite(input.movementBearingDeg)
      ? normalizeHeadingDegrees(input.movementBearingDeg)
      : null;
  const fallback =
    input.fallbackBearingDeg != null && Number.isFinite(input.fallbackBearingDeg)
      ? normalizeHeadingDegrees(input.fallbackBearingDeg)
      : null;
  const held =
    input.heldHeadingDeg != null && Number.isFinite(input.heldHeadingDeg)
      ? normalizeHeadingDegrees(input.heldHeadingDeg)
      : null;

  const speed = input.speedMps;
  const trustCourse =
    course != null &&
    speed != null &&
    Number.isFinite(speed) &&
    speed >= NAV_HEADING_TRUST_COURSE_SPEED_MPS;

  // Falsches Polyline-Segment (180°-Sprung) kurz verwerfen — sonst dreht der Pfeil im Kreis.
  if (
    poly != null &&
    held != null &&
    !headingsAgreeDeg(poly, held, NAV_HEADING_POLY_FLIP_REJECT_DEG)
  ) {
    poly = null;
  }

  if (isMovingForNavHeading(speed)) {
    if (poly != null) {
      if (trustCourse && course != null && headingsAgreeDeg(course, poly, NAV_HEADING_COURSE_POLY_AGREE_DEG)) {
        return course;
      }
      return poly;
    }
    if (trustCourse && course != null) return course;
    if (movement != null) return movement;
    // Kein Step/Ziel-Bearing während Fahrt — der „sucht“ und dreht.
    return held;
  }

  // Stehend: nicht auf Jitter-Kurs / Step-Sprünge wechseln.
  if (held != null) return held;
  return poly ?? course ?? fallback;
}

/**
 * Deadband → EMA → Rate-Limit. Erstes Sample snappt.
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
    polylineBearingDeg?: number | null;
    movementBearingDeg?: number | null;
    fallbackBearingDeg?: number | null;
    nowMs?: number;
  },
): { state: NavHeadingSmootherState; heading: number | null } {
  const raw = pickNavHeadingRaw({
    speedMps: input.speedMps,
    courseDeg: input.courseDeg,
    polylineBearingDeg: input.polylineBearingDeg,
    movementBearingDeg: input.movementBearingDeg,
    fallbackBearingDeg: input.fallbackBearingDeg,
    heldHeadingDeg: state.heading,
  });
  return applyNavHeadingSmooth(state, raw, input.nowMs ?? Date.now());
}

/** Leichte Positions-EMA gegen GPS-Rauschen. */
export function tickNavPosition(
  state: NavPositionSmootherState,
  lat: number,
  lon: number,
  alpha: number = NAV_POSITION_EMA_ALPHA,
): { state: NavPositionSmootherState; lat: number; lon: number } {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return {
      state,
      lat: state.lat ?? lat,
      lon: state.lon ?? lon,
    };
  }
  if (state.lat == null || state.lon == null) {
    const next = { lat, lon };
    return { state: next, lat, lon };
  }
  const a = Math.max(0.05, Math.min(1, alpha));
  const nextLat = state.lat + (lat - state.lat) * a;
  const nextLon = state.lon + (lon - state.lon) * a;
  const next = { lat: nextLat, lon: nextLon };
  return { state: next, lat: nextLat, lon: nextLon };
}
