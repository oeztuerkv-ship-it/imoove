/**
 * NavigationEngine — reine Tick-Typen (kein React).
 */

import type { OffRouteTrackerState } from "./OffRouteEngine";
import type { NavHeadingSmootherState, NavPositionSmootherState } from "../navHeadingSmoother";
import type { NavCameraZoomState } from "./navCameraZoom";

export type LatLon = { lat: number; lon: number };

export type NavFix = {
  lat: number;
  lon: number;
  speedMps?: number | null;
  courseDeg?: number | null;
  /** Horizontal accuracy (m), Expo `coords.accuracy`. */
  accuracyM?: number | null;
  /** Course/heading accuracy (deg) if the platform provides it. */
  headingAccuracyDeg?: number | null;
  nowMs: number;
};

/** P2: headingState steuert Übernahme / Halten / kein neues Drehen. */
export type NavHeadingStateKind = "VALID" | "UNRELIABLE" | "LOST";
export type NavGpsStateKind = "ACTIVE" | "STALE" | "LOST";
export type NavRouteRuntimeKind = "idle" | "navigating" | "rerouting" | "off_route";
export type NavHeadingQualityKind = "none" | "held" | "derived" | "course";
export type NavHeadingDiagReason =
  | "gps_heading_valid"
  | "movement_heading_valid"
  | "hold_last_valid"
  | "heading_unreliable"
  | "gps_lost";

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
  /**
   * Monotone Route-Generation (Screen bumped bei applyNavRouteResult).
   * Match/Progress ignorieren Snapshots mit kleinerer Generation als Engine-State.
   */
  generation: number;
};

export type ManeuverKind =
  | "left"
  | "right"
  | "straight"
  | "uturn"
  | "roundabout"
  | "arrive"
  | "depart"
  | "other";

export type NavManeuverOut = {
  stepIdx: number;
  instruction: string;
  maneuver: string;
  roadName: string | null;
  /** Meter bis Manöver — immer aus committedProgressM (RouteProgressEngine). */
  distanceM: number;
  kind: ManeuverKind;
  nextManeuver: string | null;
  nextRoadName: string | null;
  nextKind: ManeuverKind | null;
};

/**
 * Zentrale Laufzeit-Wahrheit nach einem atomaren Tick-Commit.
 * Screen-Refs sind P1 nur Spiegel dieses Objekts.
 */
export type NavigationState = {
  rawPosition: LatLon | null;
  filteredPosition: LatLon | null;
  snappedPosition: LatLon | null;
  displayPosition: LatLon | null;
  speed: number | null;
  accuracy: number | null;
  rawHeading: number | null;
  heading: number | null;
  headingAccuracy: number | null;
  headingQuality: NavHeadingQualityKind;
  headingState: NavHeadingStateKind;
  /** Last committed VALID heading (display/camera). Unchanged on UNRELIABLE/LOST. */
  lastValidHeading: number | null;
  headingReason: NavHeadingDiagReason;
  isSnapped: boolean;
  gpsState: NavGpsStateKind;
  routeState: NavRouteRuntimeKind;
  routeGeneration: number;
  routeProgress: number;
  maneuverState: NavManeuverOut | null;
  lastFixAt: number | null;
  lastValidHeadingAt: number | null;
  remainingDistM: number;
  remainingMin: number;
  distToManeuverM: number;
  guidanceStale: boolean;
  confirmedOffRoute: boolean;
};

export type NavEngineState = {
  position: NavPositionSmootherState;
  heading: NavHeadingSmootherState;
  offRoute: OffRouteTrackerState;
  cameraZoom: NavCameraZoomState;
  routeProgressM: number;
  stepIdx: number;
  lastRawFix: { lat: number; lon: number; atMs: number } | null;
  /** Reroute läuft — Guidance stale. */
  rerouteInFlight: boolean;
  /** Zuletzt per resetNavEngineForRoute gebundene Route-Generation. */
  routeGeneration: number;
  /** Eine aktive Navigation; Async-Work prüft Gleichheit vor Commit. */
  navigationSessionId: number;
  /** Background→Foreground: alter Fix nicht als aktuell, Off-Route/Kamera warten. */
  gpsResyncing: boolean;
  /** Eine Runtime-Instanz — Screen hält denselben Snapshot nach dem Tick. */
  runtime: NavigationState;
};

export type NavEngineOutput = {
  /**
   * Intern: gefilterte GPS-Position (Progress / Off-Route / Location-Share).
   * Nicht für Fahrzeugpfeil / navPoseRef.lat/lon verwenden.
   */
  filtered: LatLon;
  /**
   * Einheitliche Display-Pose (Schritt 2): Filter → Map-Match → Anzeige.
   * Quelle für Marker + navPoseRef.lat/lon. Heading separat in `heading`.
   */
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
  /** Laufzeit-Diagnose für [NavDiag] Overlay/Logs. */
  diag: {
    forwardDistM: number | null;
    routeBearingDeg: number | null;
    courseForOffDeg: number | null;
    headingDeltaDeg: number | null;
    gpsSpeedMps: number | null;
    derivedSpeedMps: number | null;
    fixDtMs: number | null;
    routeGeneration: number;
    boundRouteGeneration: number;
  };
};

export type NavTickResult = {
  state: NavEngineState;
  output: NavEngineOutput;
  /** Alias auf `state.runtime` — ein Objekt, kein zweiter Store. */
  navigation: NavigationState;
};
