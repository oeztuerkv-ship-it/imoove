import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, MarkerAnimated, Polyline } from "react-native-maps";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useSmoothedDriverMarker } from "@/hooks/useSmoothedDriverMarker";
import { useColors } from "@/hooks/useColors";
import {
  LIVE_DRIVER_CAMERA_DURATION_MS,
  LIVE_DRIVER_CAMERA_MIN_INTERVAL_MS,
} from "@/utils/liveDriverMarkerMotion";
import { logMapsRuntimeDiagnosticsOnce } from "@/utils/mapsDiagnostics";
import { nativeMapViewProps } from "@/utils/nativeMapProvider";
import { type GeoLocation } from "@/utils/routing";

const DEFAULT_REGION = {
  latitude: 48.7394,
  longitude: 9.3114,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

/** Wenn GPS und Abhol-Adresse weiter auseinander liegen, in den Zoom einbeziehen (Punkt sichtbar). */
const GPS_EXTRA_FIT_THRESHOLD = 0.0015;

const MAP_CENTER_SHIFT_LAT = -0.00026;
const MAP_CENTER_SHIFT_LON = 0.00044;

const HOME_MAP_SHIFT_LAT = -0.0003;
const HOME_MAP_SHIFT_LON = 0.00078;
const HOME_MAP_PULL_DOWN_LAT = 0.00095;
const HOME_CAMERA_ZOOM = 12.9;

const FIT_PADDING_EXTRA_LEFT = 42;
const FIT_PADDING_TOP_TRIM = 14;
const FIT_PADDING_EXTRA_BOTTOM = 24;
const ROUTE_FIT_EXTRA_INSET = 48;
const ROUTE_FIT_EXTRA_TOP = 36;

const SINGLE_POINT_LAT_DELTA = 0.1;
const SINGLE_POINT_LON_DELTA = 0.11;

const LIVE_TRACKING_CAMERA_ZOOM = 15;

function isValidMapCoord(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(Math.abs(lat) < 1e-5 && Math.abs(lon) < 1e-5)
  );
}

function toMapPoint(geo: GeoLocation | null | undefined): { latitude: number; longitude: number } | null {
  if (!geo || !isValidMapCoord(geo.lat, geo.lon)) return null;
  return { latitude: geo.lat, longitude: geo.lon };
}

interface RealMapViewProps {
  origin?: GeoLocation | null;
  destination?: GeoLocation | null;
  polyline?: [number, number][];
  style?: object;
  centerKey?: number;
  driverMarker?: { lat: number; lon: number; heading?: number } | null;
  customerLiveMarker?: { lat: number; lon: number } | null;
  followLiveDriver?: boolean;
  edgePaddingTop?: number;
  edgePaddingBottom?: number;
  /** Eingebettete Vorschau (z. B. ride-select): weniger Zoom-Padding, kein User-Location-Punkt. */
  compactFit?: boolean;
  userLocation?: { lat: number; lon: number } | null;
}

export function RealMapView({
  origin,
  destination,
  polyline,
  style,
  centerKey,
  driverMarker,
  customerLiveMarker,
  followLiveDriver = false,
  edgePaddingTop = 200,
  edgePaddingBottom = 280,
  compactFit = false,
  userLocation,
}: RealMapViewProps) {
  const colors = useColors();
  const mapRef = useRef<MapView>(null);
  const mapReadyRef = useRef(false);
  const lastLiveCameraAtRef = useRef(0);
  const liveFollowBootstrappedRef = useRef(false);

  const { animatedCoordinate, rotation, cameraTarget, tweenDurationMs } =
    useSmoothedDriverMarker(driverMarker);

  /** Apple Maps ignores Marker.rotation — rotate the child View instead. */
  const [tracksDriverView, setTracksDriverView] = useState(true);
  useEffect(() => {
    if (!animatedCoordinate) return;
    setTracksDriverView(true);
    const t = setTimeout(() => setTracksDriverView(false), 450);
    return () => clearTimeout(t);
  }, [animatedCoordinate, rotation]);

  const fitMap = useCallback(() => {
    if (!mapRef.current) return;

    const originPoint = toMapPoint(origin);
    const destPoint = toMapPoint(destination);
    const gpsPoint =
      userLocation != null && isValidMapCoord(userLocation.lat, userLocation.lon)
        ? { latitude: userLocation.lat, longitude: userLocation.lon }
        : null;
    const driverPoint =
      driverMarker != null && isValidMapCoord(driverMarker.lat, driverMarker.lon)
        ? { latitude: driverMarker.lat, longitude: driverMarker.lon }
        : null;

    // Live follow: only initial / route-anchor fit here — continuous follow is soft camera below.
    if (followLiveDriver && driverPoint) {
      const liveCoords = [driverPoint];
      if (originPoint) liveCoords.push(originPoint);
      if (destPoint) liveCoords.push(destPoint);
      const livePadding = {
        top: Math.max(56, edgePaddingTop - 48),
        right: 44,
        bottom: Math.max(140, edgePaddingBottom - 80),
        left: 44,
      };
      if (liveCoords.length === 1) {
        mapRef.current.animateCamera(
          { center: driverPoint, pitch: 0, heading: 0, zoom: LIVE_TRACKING_CAMERA_ZOOM },
          { duration: LIVE_DRIVER_CAMERA_DURATION_MS },
        );
      } else {
        mapRef.current.fitToCoordinates(liveCoords, { edgePadding: livePadding, animated: true });
      }
      liveFollowBootstrappedRef.current = true;
      lastLiveCameraAtRef.current = Date.now();
      return;
    }

    const padding = compactFit
      ? {
          top: Math.max(12, edgePaddingTop),
          right: 20,
          bottom: Math.max(12, edgePaddingBottom),
          left: 20,
        }
      : {
          top:
            Math.max(52, edgePaddingTop - FIT_PADDING_TOP_TRIM) +
            ROUTE_FIT_EXTRA_INSET +
            ROUTE_FIT_EXTRA_TOP,
          right: 56 + ROUTE_FIT_EXTRA_INSET,
          bottom: edgePaddingBottom + FIT_PADDING_EXTRA_BOTTOM + ROUTE_FIT_EXTRA_INSET,
          left: 64 + FIT_PADDING_EXTRA_LEFT + ROUTE_FIT_EXTRA_INSET,
        };

    if (originPoint && destPoint) {
      const coords: { latitude: number; longitude: number }[] = [originPoint, destPoint];
      if (gpsPoint) {
        const dLat = Math.abs(gpsPoint.latitude - originPoint.latitude);
        const dLon = Math.abs(gpsPoint.longitude - originPoint.longitude);
        if (dLat > GPS_EXTRA_FIT_THRESHOLD || dLon > GPS_EXTRA_FIT_THRESHOLD) {
          coords.push(gpsPoint);
        }
      }
      mapRef.current.fitToCoordinates(coords, { edgePadding: padding, animated: true });
      return;
    }

    const center = gpsPoint ?? originPoint ?? destPoint ?? driverPoint;
    if (center) {
      const home = destPoint == null;
      const latShift = home
        ? HOME_MAP_SHIFT_LAT + HOME_MAP_PULL_DOWN_LAT
        : MAP_CENTER_SHIFT_LAT;
      const lonShift = home ? HOME_MAP_SHIFT_LON : MAP_CENTER_SHIFT_LON;
      const lat = center.latitude + latShift;
      const lon = center.longitude + lonShift;

      if (home) {
        mapRef.current.animateCamera(
          {
            center: { latitude: lat, longitude: lon },
            pitch: 0,
            heading: 0,
            zoom: HOME_CAMERA_ZOOM,
          },
          { duration: 600 },
        );
      } else {
        mapRef.current.animateToRegion(
          {
            latitude: lat,
            longitude: lon,
            latitudeDelta: SINGLE_POINT_LAT_DELTA,
            longitudeDelta: SINGLE_POINT_LON_DELTA,
          },
          600,
        );
      }
    }
  }, [
    origin?.lat,
    origin?.lon,
    destination?.lat,
    destination?.lon,
    edgePaddingTop,
    edgePaddingBottom,
    userLocation?.lat,
    userLocation?.lon,
    followLiveDriver,
    // Intentionally omit driverMarker lat/lon — soft camera handles live updates.
    compactFit,
    Boolean(driverMarker),
  ]);

  const handleMapReady = useCallback(() => {
    mapReadyRef.current = true;
    logMapsRuntimeDiagnosticsOnce("RealMapView.onMapReady");
    setTimeout(fitMap, 300);
  }, [fitMap]);

  useEffect(() => {
    logMapsRuntimeDiagnosticsOnce("RealMapView.mount");
  }, []);

  useEffect(() => {
    if (!mapReadyRef.current) return;
    if (followLiveDriver) {
      liveFollowBootstrappedRef.current = false;
    }
    fitMap();
  }, [fitMap, centerKey]);

  // Soft camera follow: throttled per GPS fix (not via fitMap deps — that caused jump/refit).
  useEffect(() => {
    if (!followLiveDriver || !mapReadyRef.current || !mapRef.current || !cameraTarget) {
      return;
    }
    if (!liveFollowBootstrappedRef.current) {
      return;
    }
    const now = Date.now();
    if (now - lastLiveCameraAtRef.current < LIVE_DRIVER_CAMERA_MIN_INTERVAL_MS) {
      return;
    }
    lastLiveCameraAtRef.current = now;

    const originPoint = toMapPoint(origin);
    const destPoint = toMapPoint(destination);
    if (originPoint || destPoint) {
      const liveCoords = [cameraTarget];
      if (originPoint) liveCoords.push(originPoint);
      if (destPoint) liveCoords.push(destPoint);
      mapRef.current.fitToCoordinates(liveCoords, {
        edgePadding: {
          top: Math.max(56, edgePaddingTop - 48),
          right: 44,
          bottom: Math.max(140, edgePaddingBottom - 80),
          left: 44,
        },
        animated: true,
      });
      return;
    }

    const duration = Math.max(
      LIVE_DRIVER_CAMERA_DURATION_MS,
      tweenDurationMs > 0 ? tweenDurationMs : LIVE_DRIVER_CAMERA_DURATION_MS,
    );
    mapRef.current.animateCamera(
      {
        center: cameraTarget,
        pitch: 0,
        heading: 0,
        zoom: LIVE_TRACKING_CAMERA_ZOOM,
      },
      { duration },
    );
  }, [
    followLiveDriver,
    cameraTarget?.latitude,
    cameraTarget?.longitude,
    tweenDurationMs,
    origin?.lat,
    origin?.lon,
    destination?.lat,
    destination?.lon,
    edgePaddingTop,
    edgePaddingBottom,
  ]);

  useEffect(() => {
    if (!followLiveDriver) {
      liveFollowBootstrappedRef.current = false;
    }
  }, [followLiveDriver]);

  const routeCoords = useMemo(() => {
    if (polyline && polyline.length >= 2) {
      return polyline.map(([lat, lon]) => ({ latitude: lat, longitude: lon }));
    }
    const originPoint = toMapPoint(origin);
    const destPoint = toMapPoint(destination);
    if (originPoint && destPoint) {
      return [originPoint, destPoint];
    }
    return [];
  }, [polyline, origin?.lat, origin?.lon, destination?.lat, destination?.lon]);

  const originPoint = toMapPoint(origin);
  const destPoint = toMapPoint(destination);
  const isHomeMap = destination == null;
  const homeMapPadding = isHomeMap
    ? {
        top: Math.round(edgePaddingTop),
        bottom: Math.round(edgePaddingBottom),
        left: 8,
        right: 104,
      }
    : undefined;

  return (
    <MapView
      ref={mapRef}
      style={[StyleSheet.absoluteFill, style]}
      initialRegion={DEFAULT_REGION}
      {...nativeMapViewProps()}
      showsUserLocation={!compactFit}
      showsMyLocationButton={false}
      showsCompass={false}
      toolbarEnabled={false}
      mapPadding={homeMapPadding}
      onMapReady={handleMapReady}
    >
      {originPoint && (
        <Marker
          coordinate={originPoint}
          title={origin?.displayName?.split(",")[0] ?? "Start"}
          pinColor="#2563EB"
        />
      )}
      {destPoint && destination && (
        <Marker
          coordinate={destPoint}
          title={destination.displayName.split(",")[0]}
          pinColor="#EF4444"
        />
      )}
      {animatedCoordinate && (
        <MarkerAnimated
          coordinate={animatedCoordinate}
          title="Ihr Fahrer"
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={tracksDriverView}
        >
          <View style={styles.driverIconWrap}>
            <View style={{ transform: [{ rotate: `${rotation}deg` }] }}>
              <MaterialCommunityIcons name="car" size={30} color="#1D4ED8" />
            </View>
          </View>
        </MarkerAnimated>
      )}
      {customerLiveMarker && isValidMapCoord(customerLiveMarker.lat, customerLiveMarker.lon) && (
        <Marker
          coordinate={{ latitude: customerLiveMarker.lat, longitude: customerLiveMarker.lon }}
          title="Kunde"
          pinColor="#22C55E"
        />
      )}
      {routeCoords.length > 1 && (
        <Polyline
          coordinates={routeCoords}
          strokeColor={colors.primary}
          strokeWidth={4}
        />
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  driverIconWrap: {
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 2,
    borderColor: "#2563EB",
    shadowColor: "#0F172A",
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});
