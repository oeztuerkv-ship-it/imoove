/**
 * CameraEngine (Schritt 6) — einziger Owner für Navi-Kamera-Updates.
 *
 * NavigationState → tickCameraEngine → CameraCommand → applyCameraCommand(map)
 *
 * - center: Display-Pose + Lookahead
 * - bearing: geglättetes Heading (kein Magnetometer)
 * - pitch: moderne Fahrerperspektive (~62°)
 * - zoom: Speed-Bänder + Hysterese (kein Pumpen pro Fix)
 */

import {
  NAV_CAMERA_FOLLOW_DURATION_MS,
  NAV_CAMERA_FOLLOW_MIN_INTERVAL_MS,
  NAV_CAMERA_FOLLOW_MIN_INTERVAL_STILL_MS,
  NAV_CAMERA_MIN_HEADING_DELTA_DEG,
  NAV_CAMERA_MIN_MOVE_M,
  NAV_CAMERA_STILL_MIN_MOVE_M,
  isUsableCourse,
} from "../navHeadingSmoother";
import { shortestRotationDelta } from "../liveDriverMarkerMotion";
import {
  createNavCameraZoomState,
  NAV_CAMERA_PITCH_NAV,
  NAV_CAMERA_ZOOM_DEFAULT,
  tickNavCameraZoom,
  type NavCameraZoomState,
} from "./navCameraZoom";
import type { LatLon, NavHeadingStateKind } from "./types";

/** Lookahead vor dem Fahrzeug (m) — Puck bleibt im unteren Drittel. */
export const NAV_CAMERA_LOOKAHEAD_M = 42;

/** Zoom erst anwenden, wenn Ziel sich um mind. so viel unterscheidet. */
export const NAV_CAMERA_ZOOM_APPLY_MIN_DELTA = 0.22;

export type CameraEngineState = {
  zoom: NavCameraZoomState;
  lastApplied: {
    lat: number;
    lon: number;
    heading: number;
    zoom: number;
    pitch: number;
    atMs: number;
  } | null;
  lastFollowAtMs: number | null;
  initialized: boolean;
  /** false nach Unmount — keine nativen Camera-Calls. */
  mounted: boolean;
  pending: { lat: number; lon: number; heading: number | null } | null;
};

export type CameraIntent = {
  display: LatLon;
  heading: number | null;
  headingState?: NavHeadingStateKind;
  speedMps: number | null;
  nowMs: number;
  followEnabled: boolean;
  mapReady: boolean;
  force?: boolean;
  still?: boolean;
  resetZoom?: boolean;
  animated?: boolean;
  userPreferredZoom?: number | null;
};

export type CameraCommand = {
  center: { latitude: number; longitude: number };
  heading: number;
  pitch: number;
  zoom: number;
  altitude: number;
  mode: "set" | "animate";
  durationMs: number;
};

/** Minimales Map-Handle — nur CameraEngine darf diese Methoden rufen. */
export type NavMapCameraHandle = {
  setCamera?: (camera: Record<string, unknown>) => void;
  animateCamera?: (
    camera: Record<string, unknown>,
    opts?: { duration?: number },
  ) => void;
  fitToCoordinates?: (
    coords: { latitude: number; longitude: number }[],
    opts?: {
      edgePadding?: { top: number; right: number; bottom: number; left: number };
      animated?: boolean;
    },
  ) => void;
};

export function createCameraEngineState(
  initialZoom: number = NAV_CAMERA_ZOOM_DEFAULT,
): CameraEngineState {
  return {
    zoom: createNavCameraZoomState(initialZoom),
    lastApplied: null,
    lastFollowAtMs: null,
    initialized: false,
    mounted: true,
    pending: null,
  };
}

export function setCameraEngineMounted(
  state: CameraEngineState,
  mounted: boolean,
): CameraEngineState {
  return { ...state, mounted };
}

function isValidDisplayPose(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

/** Offset entlang Bearing (Lookahead). */
export function offsetLatLonByBearingM(
  lat: number,
  lon: number,
  bearingDeg: number,
  meters: number,
): LatLon {
  if (!Number.isFinite(meters) || meters === 0) return { lat, lon };
  const R = 6371000;
  const δ = meters / R;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);
  const φ2 = Math.asin(sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * sinδ * cosφ1, cosδ - sinφ1 * Math.sin(φ2));
  const outLat = (φ2 * 180) / Math.PI;
  const outLon = (((λ2 * 180) / Math.PI + 540) % 360) - 180;
  if (!isValidDisplayPose(outLat, outLon)) return { lat, lon };
  return { lat: outLat, lon: outLon };
}

export function zoomLevelToAltitudeMeters(zoom: number, latitude: number): number {
  const z = Number.isFinite(zoom) ? zoom : NAV_CAMERA_ZOOM_DEFAULT;
  const lat = Number.isFinite(latitude) ? latitude : 0;
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

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

function resolveHeading(
  state: CameraEngineState,
  intent: CameraIntent,
): number | null {
  if (intent.headingState === "LOST") {
    if (state.lastApplied && isUsableCourse(state.lastApplied.heading)) {
      return state.lastApplied.heading;
    }
    return null;
  }
  if (intent.still && state.lastApplied && isUsableCourse(state.lastApplied.heading)) {
    return state.lastApplied.heading;
  }
  if (isUsableCourse(intent.heading)) return intent.heading;
  if (state.lastApplied && isUsableCourse(state.lastApplied.heading)) {
    return state.lastApplied.heading;
  }
  return null;
}

/**
 * Ein Camera-Tick: Zoom + Follow-Gates + Lookahead → höchstens ein Command.
 */
export function tickCameraEngine(
  state: CameraEngineState,
  intent: CameraIntent,
): { state: CameraEngineState; command: CameraCommand | null } {
  if (!state.mounted) {
    return { state, command: null };
  }

  if (!intent.force && !intent.followEnabled) {
    return { state, command: null };
  }

  const { lat, lon } = intent.display;
  if (!isValidDisplayPose(lat, lon)) {
    return { state, command: null };
  }

  let zoomState = state.zoom;
  if (intent.resetZoom) {
    zoomState = createNavCameraZoomState(NAV_CAMERA_ZOOM_DEFAULT);
  }

  const zoomTick = tickNavCameraZoom(zoomState, {
    speedMps: intent.speedMps,
    nowMs: intent.nowMs,
    userPreferredZoom: intent.resetZoom ? null : intent.userPreferredZoom,
    force: !!intent.force || !!intent.resetZoom,
  });
  zoomState = zoomTick.state;

  const heading = resolveHeading(state, intent);
  if (!isUsableCourse(heading)) {
    // Ohne Heading: nur merken wenn Map noch nicht ready
    if (!intent.mapReady) {
      return {
        state: {
          ...state,
          zoom: zoomState,
          pending: { lat, lon, heading: null },
        },
        command: null,
      };
    }
    return { state: { ...state, zoom: zoomState }, command: null };
  }

  if (!intent.mapReady) {
    return {
      state: {
        ...state,
        zoom: zoomState,
        pending: { lat, lon, heading },
      },
      command: null,
    };
  }

  const still = !!intent.still;
  const followInterval = still
    ? NAV_CAMERA_FOLLOW_MIN_INTERVAL_STILL_MS
    : NAV_CAMERA_FOLLOW_MIN_INTERVAL_MS;

  if (
    !intent.force &&
    state.initialized &&
    state.lastFollowAtMs != null &&
    intent.nowMs - state.lastFollowAtMs < followInterval
  ) {
    return { state: { ...state, zoom: zoomState }, command: null };
  }

  // Apply-Hysterese: Position / Heading / Zoom
  if (!intent.force && state.lastApplied && state.initialized) {
    const prev = state.lastApplied;
    const movedM = haversineM({ lat: prev.lat, lon: prev.lon }, { lat, lon });
    const dHead = Math.abs(shortestRotationDelta(prev.heading, heading));
    const dZoom = Math.abs(zoomTick.zoom - prev.zoom);
    const minMove = still ? NAV_CAMERA_STILL_MIN_MOVE_M : NAV_CAMERA_MIN_MOVE_M;
    const headingQuiet = still || dHead < NAV_CAMERA_MIN_HEADING_DELTA_DEG;
    const zoomQuiet = dZoom < NAV_CAMERA_ZOOM_APPLY_MIN_DELTA;
    if (movedM < minMove && headingQuiet && zoomQuiet) {
      return { state: { ...state, zoom: zoomState }, command: null };
    }
  }

  const lookAhead = still
    ? { lat, lon }
    : offsetLatLonByBearingM(lat, lon, heading, NAV_CAMERA_LOOKAHEAD_M);

  const pitch = NAV_CAMERA_PITCH_NAV;
  const zoom = zoomTick.zoom;
  if (
    !Number.isFinite(lookAhead.lat) ||
    !Number.isFinite(lookAhead.lon) ||
    !Number.isFinite(heading) ||
    !Number.isFinite(zoom) ||
    !Number.isFinite(pitch)
  ) {
    return { state: { ...state, zoom: zoomState }, command: null };
  }

  const animated =
    intent.animated !== false &&
    !intent.force &&
    !still &&
    state.initialized;
  const durationMs = animated ? NAV_CAMERA_FOLLOW_DURATION_MS : 0;
  const mode: CameraCommand["mode"] =
    intent.force || !state.initialized || durationMs === 0 ? "set" : "animate";

  const command: CameraCommand = {
    center: { latitude: lookAhead.lat, longitude: lookAhead.lon },
    heading,
    pitch,
    zoom,
    altitude: zoomLevelToAltitudeMeters(zoom, lookAhead.lat),
    mode,
    durationMs,
  };

  return {
    state: {
      ...state,
      zoom: zoomState,
      lastApplied: {
        lat,
        lon,
        heading,
        zoom,
        pitch,
        atMs: intent.nowMs,
      },
      lastFollowAtMs: intent.nowMs,
      initialized: true,
      pending: null,
    },
    command,
  };
}

/** Pending nach MapReady anwenden. */
export function consumePendingCamera(
  state: CameraEngineState,
  opts?: { nowMs?: number },
): { state: CameraEngineState; command: CameraCommand | null } {
  const pending = state.pending;
  if (!pending || !state.mounted) {
    return { state, command: null };
  }
  const pendingHeading = isUsableCourse(pending.heading) ? pending.heading : null;
  return tickCameraEngine(state, {
    display: { lat: pending.lat, lon: pending.lon },
    heading: pendingHeading,
    headingState: pendingHeading == null ? "LOST" : undefined,
    speedMps: 0,
    nowMs: opts?.nowMs ?? Date.now(),
    followEnabled: true,
    mapReady: true,
    force: true,
    animated: false,
  });
}

export function isFiniteCameraCommand(cmd: CameraCommand): boolean {
  return (
    Number.isFinite(cmd.center.latitude) &&
    Number.isFinite(cmd.center.longitude) &&
    Number.isFinite(cmd.heading) &&
    Number.isFinite(cmd.pitch) &&
    Number.isFinite(cmd.zoom) &&
    Number.isFinite(cmd.altitude) &&
    Number.isFinite(cmd.durationMs)
  );
}

/**
 * Einziger Ort für native setCamera / animateCamera (Navi).
 */
export function applyCameraCommand(
  map: NavMapCameraHandle | null | undefined,
  cmd: CameraCommand,
  opts?: {
    useAltitude?: boolean;
    onProgrammatic?: (durationMs: number) => void;
  },
): boolean {
  if (!map || !isFiniteCameraCommand(cmd)) return false;
  const useAltitude = opts?.useAltitude ?? true;
  const cam: Record<string, unknown> = {
    center: cmd.center,
    heading: cmd.heading,
    pitch: cmd.pitch,
  };
  if (useAltitude) {
    cam.altitude = cmd.altitude;
  } else {
    cam.zoom = cmd.zoom;
  }
  try {
    opts?.onProgrammatic?.(Math.max(cmd.durationMs, cmd.mode === "set" ? 400 : 0));
    if (cmd.mode === "set" || cmd.durationMs === 0) {
      map.setCamera?.(cam);
    } else {
      map.animateCamera?.(cam, { duration: cmd.durationMs });
    }
    return true;
  } catch {
    return false;
  }
}

/** Overview (fit) — Follow bewusst aus; trotzdem nur über CameraEngine. */
export function applyCameraOverviewFit(
  map: NavMapCameraHandle | null | undefined,
  coords: { latitude: number; longitude: number }[],
  opts?: { onProgrammatic?: (durationMs: number) => void },
): boolean {
  if (!map || coords.length < 2) return false;
  try {
    opts?.onProgrammatic?.(900);
    map.fitToCoordinates?.(coords, {
      edgePadding: { top: 180, right: 40, bottom: 220, left: 40 },
      animated: true,
    });
    return true;
  } catch {
    return false;
  }
}
