/**
 * MapMatchingEngine (Schritt 2) — gefilterte GPS-Position → einheitliche Display-Pose auf der Route.
 *
 * Pipeline: GPS/NavFix → Filter (außerhalb) → matchMapDisplayPose → Display-Pose
 *
 * - `filtered`: intern (Progress / Off-Route) — nicht für Marker/Pose-lat/lon
 * - `display`: einzige Anzeigepose (Marker, navPoseRef.lat/lon)
 * - Während Reroute (`allowSnap: false`): kein Snap auf alte Polyline
 * - Stale Route-Generation: kein Snap (alte Geometrie nach neuer Route)
 */

import { NAV_MARKER_SNAP_MAX_LATERAL_M } from "../navHeadingSmoother";
import { snapLatLonToPolyline } from "../routeRemainingAlongPolyline";
import type { LatLon } from "./types";

export type MapMatchInput = {
  filtered: LatLon;
  polyline: LatLon[];
  /** Engine-State: zuletzt per resetNavEngineForRoute übernommene Generation. */
  boundRouteGeneration: number;
  /** Snapshot der aktuellen Tick-Route (aus Screen-Refs). */
  routeGeneration: number;
  /** false während rerouteInFlight — kein Snap auf verworfene Geometrie. */
  allowSnap: boolean;
  maxLateralM?: number;
};

export type MapMatchResult = {
  /** Einheitliche Anzeigepose. */
  display: LatLon;
  /** Intern gefilterte Position (unverändert durchgereicht). */
  filtered: LatLon;
  snapped: boolean;
  /** true wenn Snap wegen Reroute/stale Generation unterdrückt wurde. */
  snapSuppressed: boolean;
};

/**
 * Map-Match für Anzeige. Heading ist nicht Teil dieses Moduls.
 */
export function matchMapDisplayPose(input: MapMatchInput): MapMatchResult {
  const { filtered, polyline } = input;
  const maxLat = input.maxLateralM ?? NAV_MARKER_SNAP_MAX_LATERAL_M;

  const staleGeneration =
    input.routeGeneration > 0 &&
    input.boundRouteGeneration > 0 &&
    input.routeGeneration < input.boundRouteGeneration;

  if (!input.allowSnap || staleGeneration || polyline.length < 2) {
    return {
      display: filtered,
      filtered,
      snapped: false,
      snapSuppressed: !input.allowSnap || staleGeneration,
    };
  }

  const snap = snapLatLonToPolyline(polyline, filtered, maxLat);
  return {
    display: snap ?? filtered,
    filtered,
    snapped: snap != null,
    snapSuppressed: false,
  };
}
