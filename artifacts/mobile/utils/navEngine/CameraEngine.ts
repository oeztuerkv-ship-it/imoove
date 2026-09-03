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
  isMovingForNavHeading,
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
import type { LatLon, NavHeadingStateKind, NavigationState } from "./types";

/** Lookahead vor dem Fahrzeug (m) — Puck bleibt im unteren Drittel. */
export const NAV_CAMERA_LOOKAHEAD_M = 42;

/** Zoom erst anwenden, wenn Ziel sich um mind. so viel unterscheidet. */
export const NAV_CAMERA_ZOOM_APPLY_MIN_DELTA = 0.22;

export type CameraNavMode = "FOLLOW" | "OVERVIEW" | "FREE";

export type CameraPending = {
  lat: number;
  lon: number;
  heading: number | null;
  headingState: NavHeadingStateKind;
  speedMps: number | null;
  routeGeneration: number;
  sessionToken: number;
};

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
  mode: CameraNavMode;
  routeGeneration: number;
  sessionToken: number;
  userPreferredZoom: number | null;
  gesturePauseUntilMs: number;
  pending: CameraPending | null;
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
  /** Recenter / Route: Modus FOLLOW, dann Tick. */
  enterFollow?: boolean;
};

export type CameraCommand = {
  center: { latitude: number; longitude: number };
  heading: number;
  pitch: number;
  zoom: number;
  altitude: number;
  mode: "set" | "animate";
  durationMs: number;
  sessionToken: number;
  routeGeneration: number;
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
    mode: "FOLLOW",
    routeGeneration: 0,
    sessionToken: 1,
    userPreferredZoom: null,
    gesturePauseUntilMs: 0,
    pending: null,
  };
}

export function setCameraEngineMounted(
  state: CameraEngineState,
  mounted: boolean,
): CameraEngineState {
  return { ...state, mounted };
}

export function bumpCameraSession(state: CameraEngineState): CameraEngineState {
  return {
    ...state,
    sessionToken: state.sessionToken + 1,
    pending: null,
    initialized: false,
    lastFollowAtMs: null,
  };
}

export function bindCameraRouteGeneration(
  state: CameraEngineState,
  routeGeneration: number,
): CameraEngineState {
  const gen = Math.max(0, routeGeneration);
  const stalePending =
    state.pending != null && state.pending.routeGeneration < gen;
  return {
    ...state,
    routeGeneration: gen,
    pending: stalePending ? null : state.pending,
  };
}

export function enterCameraMode(
  state: CameraEngineState,
  mode: CameraNavMode,
): CameraEngineState {
  return { ...state, mode };
}

export function setCameraUserPreferredZoom(
  state: CameraEngineState,
  zoom: number | null,
): CameraEngineState {
  return { ...state, userPreferredZoom: zoom };
}

export function setCameraGesturePauseUntil(
  state: CameraEngineState,
  untilMs: number,
): CameraEngineState {
  return { ...state, gesturePauseUntilMs: untilMs };
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
): { state: CameraEngineState; command: CameraCommand | null; skipReason: string | null } {
  if (!state.mounted) {
    return { state, command: null, skipReason: "unmounted" };
  }

  let next = state;
  if (intent.enterFollow && next.mode !== "FOLLOW") {
    next = { ...next, mode: "FOLLOW" };
  }
  if (next.mode !== "FOLLOW") {
    return { state: next, command: null, skipReason: `mode_${next.mode}` };
  }

  if (!intent.force && !intent.followEnabled) {
    return { state: next, command: null, skipReason: "follow_disabled" };
  }

  if (!intent.force && intent.nowMs < next.gesturePauseUntilMs) {
    return { state: next, command: null, skipReason: "gesture_pause" };
  }

  const { lat, lon } = intent.display;
  if (!isValidDisplayPose(lat, lon)) {
    return { state: next, command: null, skipReason: "invalid_pose" };
  }

  let zoomState = next.zoom;
  if (intent.resetZoom) {
    zoomState = createNavCameraZoomState(NAV_CAMERA_ZOOM_DEFAULT);
    next = { ...next, userPreferredZoom: null };
  }

  const userPreferredZoom = intent.resetZoom
    ? null
    : intent.userPreferredZoom ?? next.userPreferredZoom;

  const zoomTick = tickNavCameraZoom(zoomState, {
    speedMps: intent.speedMps,
    nowMs: intent.nowMs,
    userPreferredZoom,
    force: !!intent.force || !!intent.resetZoom,
  });
  zoomState = zoomTick.state;

  const heading = resolveHeading(next, intent);
  const pendingBase: CameraPending = {
    lat,
    lon,
    heading: isUsableCourse(heading)
      ? heading
      : isUsableCourse(intent.heading)
        ? intent.heading
        : null,
    headingState:
      intent.headingState ??
      (isUsableCourse(heading) || isUsableCourse(intent.heading) ? "VALID" : "LOST"),
    speedMps: intent.speedMps,
    routeGeneration: next.routeGeneration,
    sessionToken: next.sessionToken,
  };

  if (!isUsableCourse(heading)) {
    if (!intent.mapReady) {
      return {
        state: { ...next, zoom: zoomState, pending: pendingBase },
        command: null,
        skipReason: "pending_no_heading",
      };
    }
    return {
      state: { ...next, zoom: zoomState },
      command: null,
      skipReason: "no_heading",
    };
  }

  if (!intent.mapReady) {
    return {
      state: {
        ...next,
        zoom: zoomState,
        pending: { ...pendingBase, heading },
      },
      command: null,
      skipReason: "map_not_ready",
    };
  }

  const still = !!intent.still;
  const followInterval = still
    ? NAV_CAMERA_FOLLOW_MIN_INTERVAL_STILL_MS
    : NAV_CAMERA_FOLLOW_MIN_INTERVAL_MS;

  if (
    !intent.force &&
    next.initialized &&
    next.lastFollowAtMs != null &&
    intent.nowMs - next.lastFollowAtMs < followInterval
  ) {
    return { state: { ...next, zoom: zoomState }, command: null, skipReason: "interval" };
  }

  if (!intent.force && next.lastApplied && next.initialized) {
    const prev = next.lastApplied;
    const movedM = haversineM({ lat: prev.lat, lon: prev.lon }, { lat, lon });
    const dHead = Math.abs(shortestRotationDelta(prev.heading, heading));
    const dZoom = Math.abs(zoomTick.zoom - prev.zoom);
    const minMove = still ? NAV_CAMERA_STILL_MIN_MOVE_M : NAV_CAMERA_MIN_MOVE_M;
    const headingQuiet = still || dHead < NAV_CAMERA_MIN_HEADING_DELTA_DEG;
    const zoomQuiet = dZoom < NAV_CAMERA_ZOOM_APPLY_MIN_DELTA;
    if (movedM < minMove && headingQuiet && zoomQuiet) {
      return { state: { ...next, zoom: zoomState }, command: null, skipReason: "hysteresis" };
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
    return { state: { ...next, zoom: zoomState }, command: null, skipReason: "non_finite" };
  }

  const animated =
    intent.animated !== false &&
    !intent.force &&
    !still &&
    next.initialized;
  const durationMs = animated ? NAV_CAMERA_FOLLOW_DURATION_MS : 0;
  const cmdMode: CameraCommand["mode"] =
    intent.force || !next.initialized || durationMs === 0 ? "set" : "animate";

  const command: CameraCommand = {
    center: { latitude: lookAhead.lat, longitude: lookAhead.lon },
    heading,
    pitch,
    zoom,
    altitude: zoomLevelToAltitudeMeters(zoom, lookAhead.lat),
    mode: cmdMode,
    durationMs,
    sessionToken: next.sessionToken,
    routeGeneration: next.routeGeneration,
  };

  return {
    state: {
      ...next,
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
    skipReason: null,
  };
}

/** Pending nach MapReady: nur gespeicherter State, kein Heading-Fallback. */
export function consumePendingCamera(
  state: CameraEngineState,
  opts?: { nowMs?: number },
): { state: CameraEngineState; command: CameraCommand | null; skipReason: string | null } {
  const pending = state.pending;
  if (!pending || !state.mounted) {
    return { state, command: null, skipReason: pending ? "unmounted" : "no_pending" };
  }
  if (pending.sessionToken !== state.sessionToken) {
    return { state: { ...state, pending: null }, command: null, skipReason: "stale_session" };
  }
  if (pending.routeGeneration < state.routeGeneration) {
    return { state: { ...state, pending: null }, command: null, skipReason: "stale_generation" };
  }
  return tickCameraEngine(state, {
    display: { lat: pending.lat, lon: pending.lon },
    heading: pending.heading,
    headingState: pending.headingState,
    speedMps: pending.speedMps,
    nowMs: opts?.nowMs ?? Date.now(),
    followEnabled: true,
    mapReady: true,
    force: true,
    animated: false,
  });
}

export function tickFollowFromNav(
  state: CameraEngineState,
  nav: NavigationState,
  ctx: {
    nowMs: number;
    mapReady: boolean;
    force?: boolean;
    still?: boolean;
    resetZoom?: boolean;
    animated?: boolean;
    enterFollow?: boolean;
  },
): { state: CameraEngineState; command: CameraCommand | null; skipReason: string | null } {
  const display = nav.displayPosition;
  if (!display) {
    return { state, command: null, skipReason: "no_display" };
  }
  const bound = bindCameraRouteGeneration(state, nav.routeGeneration);
  return tickCameraEngine(bound, {
    display,
    heading: nav.heading,
    headingState: nav.headingState,
    speedMps: nav.speed,
    nowMs: ctx.nowMs,
    followEnabled: true,
    mapReady: ctx.mapReady,
    force: ctx.force,
    still: ctx.still ?? !isMovingForNavHeading(nav.speed),
    resetZoom: ctx.resetZoom,
    animated: ctx.animated,
    enterFollow: ctx.enterFollow,
    userPreferredZoom: ctx.resetZoom ? null : bound.userPreferredZoom,
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

let followNativeApplyCount = 0;

export function getFollowNativeApplyCount(): number {
  return followNativeApplyCount;
}

export function resetFollowNativeApplyCount(): void {
  followNativeApplyCount = 0;
}

/**
 * Low-level native apply. Follow-Pfad muss `applyNavigationCameraCommand` nutzen.
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

/**
 * Einziger Follow-Owner: native setCamera / animateCamera für Navi-Follow.
 */
export function applyNavigationCameraCommand(
  state: CameraEngineState,
  cmd: CameraCommand | null,
  ctx: {
    map: NavMapCameraHandle | null | undefined;
    useAltitude?: boolean;
    onProgrammatic?: (durationMs: number) => void;
  },
): { applied: boolean; reason: string } {
  if (!cmd) return { applied: false, reason: "no_command" };
  if (!state.mounted) return { applied: false, reason: "unmounted" };
  if (cmd.sessionToken !== state.sessionToken) {
    return { applied: false, reason: "stale_session" };
  }
  if (cmd.routeGeneration !== state.routeGeneration) {
    return { applied: false, reason: "stale_generation" };
  }
  followNativeApplyCount += 1;
  const ok = applyCameraCommand(ctx.map, cmd, {
    useAltitude: ctx.useAltitude,
    onProgrammatic: ctx.onProgrammatic,
  });
  return { applied: ok, reason: ok ? "applied" : "native_failed" };
}

/** Overview (fit) — expliziter Modus, blockiert GPS-Follow. */
export function applyOverviewFit(
  state: CameraEngineState,
  map: NavMapCameraHandle | null | undefined,
  coords: { latitude: number; longitude: number }[],
  opts?: { onProgrammatic?: (durationMs: number) => void },
): { state: CameraEngineState; applied: boolean } {
  if (!state.mounted || !map || coords.length < 2) {
    return { state, applied: false };
  }
  const next = enterCameraMode(state, "OVERVIEW");
  try {
    opts?.onProgrammatic?.(900);
    map.fitToCoordinates?.(coords, {
      edgePadding: { top: 180, right: 40, bottom: 220, left: 40 },
      animated: true,
    });
    return { state: next, applied: true };
  } catch {
    return { state: next, applied: false };
  }
}

/** @deprecated P3: nutze applyOverviewFit */
export function applyCameraOverviewFit(
  map: NavMapCameraHandle | null | undefined,
  coords: { latitude: number; longitude: number }[],
  opts?: { onProgrammatic?: (durationMs: number) => void },
): boolean {
  return applyOverviewFit(createCameraEngineState(), map, coords, opts).applied;
}

