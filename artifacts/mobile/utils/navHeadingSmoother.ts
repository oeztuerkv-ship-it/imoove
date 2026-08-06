/**
 * Fahrer-Navi Kamera-Heading: Speed-Gate + EMA + Deadband + Rate-Limit.
 *
 * Branchenüblich (Apple/Mapbox/Locus): Auto = **GPS-Kurs (course)**, nicht Kompass.
 * Postmortem 7668ef8a: Poly-First ließ an Kurven/Kreuzungen die Segment-Tangente springen
 * → Karte drehte hin und her, obwohl Speed ~30 km/h und Kurs brauchbar war.
 *
 * Quelle fahrend:
 * 1. GPS-Kurs wenn Speed vertrauenswürdig (ggf. aus Fix-zu-Fix abgeleitet)
 * 2. sonst Polyline-**Lookahead**-Bearing (stabiler als Einzel-Segment)
 * 3. Bewegungsbearing → halten
 * Kein Step/Ziel-Bearing während Fahrt.
 */

import {
  normalizeHeadingDegrees,
  shortestRotationDelta,
} from "./liveDriverMarkerMotion";

/** Unterhalb: stehend/Stau — Kurs oft unbrauchbar → Heading halten. */
export const NAV_HEADING_MOVING_SPEED_MPS = 1.4;

/**
 * GPS-Kurs ab dieser Speed vertrauen (~9 km/h).
 * CoreLocation: speed oft -1 (ungültig) — dann Ableitung aus Fix-Abstand nutzen.
 */
export const NAV_HEADING_TRUST_COURSE_SPEED_MPS = 2.5;

/**
 * Polyline-Segment-Sprung vs. gehaltenem Heading → Poly verwerfen
 * (nur relevant wenn Kurs fehlt und Poly Fallback ist).
 */
export const NAV_HEADING_POLY_FLIP_REJECT_DEG = 110;

/** Mikro-Jitter unter diesem Winkel nicht übernehmen. */
export const NAV_HEADING_DEADBAND_DEG = 8;

/** EMA-Gewicht auf dem Shortest-Path-Delta (0…1). */
export const NAV_HEADING_EMA_ALPHA = 0.18;

/** Max. Heading-Änderung pro Sekunde (°/s) — weichere Kurven, weniger „Ruck“. */
export const NAV_HEADING_MAX_RATE_DEG_PER_S = 22;

/** Bei langsamer Fahrt (< ~10 km/h): kleinere Rate → weniger Zittern. */
export const NAV_HEADING_MAX_RATE_SLOW_DEG_PER_S = 14;

/** Kamera-Follow Mindestabstand. */
export const NAV_CAMERA_FOLLOW_MIN_INTERVAL_MS = 900;

/** Stehend: seltener Follow — verhindert animateCamera-Stau. */
export const NAV_CAMERA_FOLLOW_MIN_INTERVAL_STILL_MS = 2200;

/** animateCamera-Dauer bei Follow — unter Follow-Intervall, weniger Überlappung. */
export const NAV_CAMERA_FOLLOW_DURATION_MS = 320;

/** Position-EMA (0…1); höher = reaktiver. */
export const NAV_POSITION_EMA_ALPHA = 0.38;

/** Min. Kamera-Update: Position (m) / Heading (°). */
export const NAV_CAMERA_MIN_MOVE_M = 2.0;
export const NAV_CAMERA_MIN_HEADING_DELTA_DEG = 4.5;

/** Stehend: Kamera nur bei größerer Positionsdrift (GPS-Rauschen sonst „sammelt“ Animationen). */
export const NAV_CAMERA_STILL_MIN_MOVE_M = 12;

/** Polyline-Lookahead für Heading-Fallback (m) — länger = stabiler an Kurven. */
export const NAV_POLY_LOOKAHEAD_M = 80;

/** Max. Querabstand (m) für UI-Snap des Pfeils auf die Route. */
export const NAV_MARKER_SNAP_MAX_LATERAL_M = 45;

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

/** GPS-Speed: ≥0 gültig; -1 / null = unbekannt (nicht als „stehend 0“ werten). */
export function isUsableGpsSpeedMps(speedMps?: number | null): speedMps is number {
  return speedMps != null && Number.isFinite(speedMps) && speedMps >= 0;
}

/**
 * Mindest-Δt für Fix-zu-Fix-Speed.
 * iOS liefert bei `distanceInterval` oft Bursts mit Δt≪1s; Clamp 50ms →
 * moved≈2m / 0.05s ≈ 40 m/s (Bug: 4 m/s GPS → „36 m/s“ effektiv).
 */
export const NAV_DERIVED_SPEED_MIN_DT_MS = 400;

/** Unphysikalische Ableitung verwerfen (~200 km/h). */
export const NAV_DERIVED_SPEED_MAX_MPS = 55;

export const NAV_DERIVED_SPEED_MIN_MOVED_M = 1;

/**
 * Fix-zu-Fix-Geschwindigkeit (m/s) oder null wenn Δt/Distanz unbrauchbar.
 */
export function deriveNavSpeedMps(movedM: number, dtMs: number): number | null {
  if (!Number.isFinite(movedM) || !Number.isFinite(dtMs)) return null;
  if (movedM < NAV_DERIVED_SPEED_MIN_MOVED_M) return null;
  if (dtMs < NAV_DERIVED_SPEED_MIN_DT_MS) return null;
  const v = movedM / (dtMs / 1000);
  if (!Number.isFinite(v) || v < 0 || v > NAV_DERIVED_SPEED_MAX_MPS) return null;
  return v;
}

/**
 * Effektive Speed: brauchbares GPS hat Vorrang.
 * Derived nur wenn GPS fehlt/-1 oder GPS „kriecht“ trotz klarer Bewegung.
 * Nie `max(gps, derived*0.5)` — das hat gute GPS-Werte mit Burst-Artefakten aufgeblasen.
 */
export function resolveNavSpeedMps(
  gpsSpeedMps?: number | null,
  derivedSpeedMps?: number | null,
): number | null {
  const gps = isUsableGpsSpeedMps(gpsSpeedMps) ? gpsSpeedMps : null;
  const derived =
    derivedSpeedMps != null &&
    Number.isFinite(derivedSpeedMps) &&
    derivedSpeedMps >= 0 &&
    derivedSpeedMps <= NAV_DERIVED_SPEED_MAX_MPS
      ? derivedSpeedMps
      : null;

  if (gps != null && gps >= NAV_HEADING_TRUST_COURSE_SPEED_MPS) {
    return gps;
  }
  if (
    gps != null &&
    gps < NAV_HEADING_TRUST_COURSE_SPEED_MPS &&
    derived != null &&
    derived >= NAV_HEADING_TRUST_COURSE_SPEED_MPS
  ) {
    return derived;
  }
  return gps ?? derived;
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
 * - fahrend: **Kurs zuerst** (wenn Speed-Gate), sonst Poly-Lookahead → Bewegung → halten
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

  // Falsches Polyline-Segment nur für Fallback verwerfen.
  if (
    poly != null &&
    held != null &&
    !headingsAgreeDeg(poly, held, NAV_HEADING_POLY_FLIP_REJECT_DEG)
  ) {
    poly = null;
  }

  if (isMovingForNavHeading(speed)) {
    // Wichtig: bei brauchbarem Kurs NICHT auf Poly warten/zwingen —
    // Poly-Tangente springt an Kurven/Kreuzungen und dreht die Karte.
    if (trustCourse && course != null) return course;
    if (poly != null) return poly;
    if (movement != null) return movement;
    return held;
  }

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
  opts?: { maxRateDegPerS?: number },
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
  const maxRate = opts?.maxRateDegPerS ?? NAV_HEADING_MAX_RATE_DEG_PER_S;
  const maxStep = maxRate * dtSec;
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
  const speed = input.speedMps;
  const slow =
    speed == null ||
    !Number.isFinite(speed) ||
    speed < NAV_HEADING_TRUST_COURSE_SPEED_MPS;
  return applyNavHeadingSmooth(state, raw, input.nowMs ?? Date.now(), {
    maxRateDegPerS: slow ? NAV_HEADING_MAX_RATE_SLOW_DEG_PER_S : NAV_HEADING_MAX_RATE_DEG_PER_S,
  });
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
