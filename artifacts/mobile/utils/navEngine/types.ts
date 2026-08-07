/**
 * NavigationEngine — reine Tick-Typen (kein React).
 */

import type { OffRouteTrackerState } from "../navOffRouteReroute";
import type { NavHeadingSmootherState, NavPositionSmootherState } from "../navHeadingSmoother";
import type { NavCameraZoomState } from "./navCameraZoom";

export type LatLon = { lat: number; lon: number };

export type NavFix = {
  lat: number;
  lon: number;
  speedMps?: number | null;
  courseDeg?: number | null;
  nowMs: number;
};

export type NavRouteStep = {
  instruction: string;
  maneuver?: string;
  roadName?: string | null;
  distanceM: number;
  lat: number;
  lon: number;
};

export type NavRouteSnapshot = {
  polyline: LatLon[];
  steps: NavRouteStep[];
  /** Autoritative Gesamtstrecke (m) für ETA-Skalierung. */
  authoritativeDistM: number;
  authoritativeEtaMin: number;
};

export type NavEngineState = {
  position: NavPositionSmootherState;
  heading: NavHeadingSmootherState;
  offRoute: OffRouteTrackerState;
  cameraZoom: NavCameraZoomState;
  routeProgressM: number;
  stepIdx: number;
  lastRawFix: { lat: number; lon: number; atMs: number } | null;
  /** Letzte Display-Pose (Snap) — Dead-Reckoning zwischen Fixes. */
  lastDisplay: LatLon | null;
  lastDisplayAtMs: number | null;
  /** Reroute läuft — Guidance stale. */
  rerouteInFlight: boolean;
};

export type NavManeuverOut = {
  stepIdx: number;
  instruction: string;
  maneuver: string;
  roadName: string | null;
  distanceM: number;
  nextManeuver: string | null;
  nextRoadName: string | null;
};

export type NavEngineOutput = {
  /** EMA-Position (Off-Route / Share). */
  filtered: LatLon;
  /** Map-matched Display-Pose (Marker + Kamera). */
  display: LatLon;
  snapped: boolean;
  heading: number | null;
  speedMps: number | null;
  routeProgressM: number;
  remainingDistM: number;
  remainingMin: number;
  distToManeuverM: number;
  stepIdx: number;
  maneuver: NavManeuverOut | null;
  /** true während Reroute — UI darf keine alten „In 300 m“ zeigen. */
  guidanceStale: boolean;
  confirmedOffRoute: boolean;
  cameraZoom: number;
  cameraPitch: number;
  /** Laufzeit-Diagnose (Falschabbiegen / Off-Route). */
  diag: {
    forwardDistM: number | null;
    routeBearingDeg: number | null;
    courseForOffDeg: number | null;
    headingDeltaDeg: number | null;
    headingForced: boolean;
    stallForced: boolean;
    /** Roh-GPS Speed (kann -1 sein). */
    gpsSpeedMps: number | null;
    /** Fix-zu-Fix Ableitung (null wenn Δt/Distanz verworfen). */
    derivedSpeedMps: number | null;
    fixDtMs: number | null;
    /** Querabstand Snap (null wenn unsapped). */
    snapLateralM: number | null;
  };
};

export type NavTickResult = {
  state: NavEngineState;
  output: NavEngineOutput;
};
