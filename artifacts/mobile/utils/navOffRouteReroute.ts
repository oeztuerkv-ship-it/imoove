/**
 * Fassade — Off-Route / Reroute leben in `navEngine/OffRouteEngine` + `RerouteEngine`.
 * Bestehende Imports bleiben stabil.
 */

export {
  NAV_OFF_ROUTE_THRESHOLD_M,
  NAV_OFF_ROUTE_CONFIRM_FIXES,
  NAV_OFF_ROUTE_CONFIRM_MS,
  NAV_OFF_ROUTE_HEADING_DELTA_DEG,
  NAV_OFF_ROUTE_HEADING_CONFIRM_MS,
  NAV_OFF_ROUTE_UTURN_DELTA_DEG,
  NAV_OFF_ROUTE_UTURN_CONFIRM_MS,
  NAV_OFF_ROUTE_HEADING_MIN_SPEED_MPS,
  NAV_OFF_ROUTE_STALL_CONFIRM_MS,
  NAV_OFF_ROUTE_STALL_MIN_SPEED_MPS,
  NAV_OFF_ROUTE_STALL_MIN_PROGRESS_M,
  NAV_ROUTE_PROGRESS_BACKTRACK_M,
  NAV_ROUTE_PROGRESS_MAX_LATERAL_M,
  createOffRouteTrackerState,
  measureRestRouteLateralM,
  effectiveOffRouteDistanceM,
  noteOffRouteSample,
  evaluateNavOffRouteSample,
} from "./navEngine/OffRouteEngine";
export type { OffRouteTrackerState } from "./navEngine/OffRouteEngine";

export {
  NAV_REROUTE_COOLDOWN_MS,
  canStartReroute,
  canBeginReroute,
  createRerouteEngineState,
  beginReroute,
  beginRouteRequest,
  shouldAcceptRerouteResponse,
  evaluateRouteResponse,
  completeReroute,
  failReroute,
  discardStaleRerouteResponse,
  isRerouteInFlight,
  invalidateInFlightRouteRequests,
  invalidateAllRouteRequests,
} from "./navEngine/RerouteEngine";
export type {
  RerouteEngineState,
  BeginRerouteResult,
  NavRouteRequest,
  NavRouteRequestReason,
  RouteDropReason,
} from "./navEngine/RerouteEngine";
