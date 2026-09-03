/**
 * Modul-Fassaden — benannte Einstiege für die NavigationEngine-Pipeline.
 * Schritt 1: LocationEngine ist der einzige GPS-Einstieg für den Fahrer-Navi-Screen.
 */

export { locationCoordsToNavFix } from "./locationCoordsToNavFix";
export type { LocationCoordsLike } from "./locationCoordsToNavFix";
export {
  startDriverNavLocationSession,
  stopDriverNavLocationSession,
  DRIVER_NAV_LOCATION_DISTANCE_INTERVAL_M,
  DRIVER_NAV_LOCATION_TIME_INTERVAL_MS,
} from "./LocationEngine";
export type { DriverNavLocationSession } from "./LocationEngine";

export { matchMapDisplayPose } from "./MapMatchingEngine";
export type { MapMatchInput, MapMatchResult } from "./MapMatchingEngine";

export {
  tickRouteProgress,
  initCommittedProgressForRoute,
  remainingFromCommittedProgress,
  distanceAlongRouteFromProgressM,
  splitPolylineAtCommittedProgressM,
  polylineLengthM,
} from "./RouteProgressEngine";
export type { RouteProgressTickInput, RouteProgressTickResult } from "./RouteProgressEngine";

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

export { remainingFromCommittedProgress as RouteProgress_remaining } from "./RouteProgressEngine";
export { scaleRemainingToAuthoritative as EtaEngine_scale } from "../routeRemainingAlongPolyline";

export {
  evaluateNavOffRouteSample as OffRouteEngine_evaluate,
  measureRestRouteLateralM,
  createOffRouteTrackerState,
  NAV_OFF_ROUTE_THRESHOLD_M,
} from "./OffRouteEngine";

export {
  canStartReroute as RerouteEngine_canStart,
  canBeginReroute,
  beginReroute,
  beginRouteRequest,
  completeReroute,
  failReroute,
  shouldAcceptRerouteResponse,
  evaluateRouteResponse,
  invalidateInFlightRouteRequests,
  invalidateAllRouteRequests,
  createRerouteEngineState,
  isRerouteInFlight,
  NAV_REROUTE_COOLDOWN_MS,
} from "./RerouteEngine";
export type {
  RerouteEngineState,
  BeginRerouteResult,
  NavRouteRequest,
  NavRouteRequestReason,
  RouteDropReason,
  RouteResponseDecision,
} from "./RerouteEngine";

export {
  buildManeuverOut as ManeuverEngine_next,
  advanceManeuverStepIdx,
  classifyManeuverKind,
  isArriveStep,
  isDepartStep,
  NAV_MANEUVER_PASS_WITHIN_M,
} from "./ManeuverEngine";
export type { BuildManeuverOpts } from "./ManeuverEngine";

export {
  tickNavCameraZoom as CameraController_tickZoom,
  createNavCameraZoomState,
  NAV_CAMERA_PITCH_NAV,
  NAV_CAMERA_ZOOM_DEFAULT,
} from "./navCameraZoom";

export {
  createCameraEngineState,
  setCameraEngineMounted,
  bumpCameraSession,
  bindCameraRouteGeneration,
  enterCameraMode,
  setCameraUserPreferredZoom,
  shouldCommitUserPreferredZoom,
  setCameraGesturePauseUntil,
  tickCameraEngine,
  tickFollowFromNav,
  consumePendingCamera,
  applyNavigationCameraCommand,
  applyOverviewFit,
  applyCameraCommand,
  applyCameraOverviewFit,
  offsetLatLonByBearingM,
  isFiniteCameraCommand,
  getFollowNativeApplyCount,
  resetFollowNativeApplyCount,
  NAV_CAMERA_LOOKAHEAD_M,
  NAV_CAMERA_ZOOM_APPLY_MIN_DELTA,
} from "./CameraEngine";
export type {
  CameraEngineState,
  CameraIntent,
  CameraCommand,
  CameraNavMode,
  CameraPending,
  NavMapCameraHandle,
} from "./CameraEngine";

export {
  nextNavigationSessionId,
  acceptNavAsync,
  classifyGpsLifecycle,
  shouldEvaluateOffRoute,
  createLocationWatchGuard,
  NAV_GPS_STALE_AFTER_MS,
  NAV_GPS_LOST_AFTER_MS,
} from "./navLifecycle";

export {
  createNavEngineState,
  beginNavGpsResync,
  resetNavEngineForRoute,
  commitNavigationRoute,
  isCommitableNavPolyline,
  nextRouteCommitGeneration,
  setNavEngineRerouteInFlight,
  invalidateNavRouteGeneration,
  tickNavEngine,
} from "./NavigationEngine";
export type { CommitNavigationRouteResult } from "./NavigationEngine";

export {
  createNavigationState,
  commitNavigationFromTick,
  commitNavigationRouteBound,
  commitNavigationFromLegacyPose,
  commitNavigationRerouteFlag,
  commitHeadingQuality,
  resolveCommittedNavHeading,
  headingTransitionChanged,
  mirrorsFromNavigationState,
} from "./NavigationState";

export type {
  LatLon,
  NavFix,
  NavRouteStep,
  NavRouteSnapshot,
  NavEngineState,
  NavEngineOutput,
  NavManeuverOut,
  ManeuverKind,
  NavTickResult,
  NavigationState,
  NavHeadingStateKind,
  NavGpsStateKind,
  NavRouteRuntimeKind,
  NavHeadingQualityKind,
  NavHeadingDiagReason,
} from "./types";
