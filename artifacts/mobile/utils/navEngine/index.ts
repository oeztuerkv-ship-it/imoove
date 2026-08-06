/**
 * Phase-2 Modul-Fassaden — benannte Einstiege für die NavigationEngine-Pipeline.
 * Implementierung bleibt in den bestehenden Utils (kein Parallel-Code).
 */

export { tickNavPosition as PositionFilter_update, createNavPositionSmootherState } from "../navHeadingSmoother";

export {
  snapLatLonToPolyline as MapMatcher_snap,
  advanceRouteProgressM as MapMatcher_advanceProgress,
  distanceToForwardPolylineM as MapMatcher_forwardDist,
  bearingAlongPolylineLookaheadDeg as MapMatcher_routeBearing,
} from "../routeRemainingAlongPolyline";

export {
  tickNavHeading as HeadingEngine_update,
  createNavHeadingSmootherState,
  resolveNavSpeedMps,
} from "../navHeadingSmoother";

export {
  remainingAlongPolyline as RouteProgress_remaining,
  scaleRemainingToAuthoritative as EtaEngine_scale,
} from "../routeRemainingAlongPolyline";

export {
  evaluateNavOffRouteSample as RerouteEngine_check,
  canStartReroute as RerouteEngine_canStart,
  createOffRouteTrackerState,
} from "../navOffRouteReroute";

export { buildManeuverOut as ManeuverEngine_next, advanceManeuverStepIdx } from "./ManeuverEngine";

export {
  tickNavCameraZoom as CameraController_tickZoom,
  createNavCameraZoomState,
  NAV_CAMERA_PITCH_NAV,
  NAV_CAMERA_ZOOM_DEFAULT,
} from "./navCameraZoom";

export {
  createNavEngineState,
  resetNavEngineForRoute,
  setNavEngineRerouteInFlight,
  tickNavEngine,
} from "./NavigationEngine";

export type {
  LatLon,
  NavFix,
  NavRouteStep,
  NavRouteSnapshot,
  NavEngineState,
  NavEngineOutput,
  NavManeuverOut,
  NavTickResult,
} from "./types";
