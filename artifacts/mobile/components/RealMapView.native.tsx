import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";

import { useColors } from "@/hooks/useColors";
import { type GeoLocation } from "@/utils/routing";

const DEFAULT_REGION = {
  latitude: 48.7394,
  longitude: 9.3114,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

/** Wenn GPS und Abhol-Adresse weiter auseinander liegen, in den Zoom einbeziehen (Punkt sichtbar). */
const GPS_EXTRA_FIT_THRESHOLD = 0.0015;

/**
 * Route (Ziel gesetzt): leichte Verschiebung nach manuellem Pan-Gefühl.
 * Start ohne Ziel: siehe HOME_* – eigene Werte, damit der blaue Punkt zwischen Chip und Sheet sitzt.
 */
const MAP_CENTER_SHIFT_LAT = -0.00026;
const MAP_CENTER_SHIFT_LON = 0.00044;

/** Nur Start-Ansicht: horizontaler Feintuning-Offset (Longitude). */
const HOME_MAP_SHIFT_LAT = -0.0003;
const HOME_MAP_SHIFT_LON = 0.00078;
/**
 * Kamera etwas nördlicher als der Standort → wirkt wie „Karte runterziehen“:
 * mehr Welt oberhalb des blauen Punkts, Punkt sitzt tiefer zwischen Chip und Sheet.
 */
const HOME_MAP_PULL_DOWN_LAT = 0.00095;
/** Google Maps: niedrigeres zoom = weiter raus (Vogelperspektive). ~14 = Stadtteil, ~13 = weiter. */
const HOME_CAMERA_ZOOM = 12.9;

/** fitToCoordinates: asymmetrisches Padding, moderat (nicht zu extrem nach unten). */
const FIT_PADDING_EXTRA_LEFT = 42;
const FIT_PADDING_TOP_TRIM = 14;
const FIT_PADDING_EXTRA_BOTTOM = 24;
/** Zusätzlicher Rand beim Routen-Fit → etwas weiter herausgezoomt. */
const ROUTE_FIT_EXTRA_INSET = 48;
/** Route zusätzlich nach oben „Luft“ → Karte wirkt nach unten versetzt / mehr Übersicht. */
const ROUTE_FIT_EXTRA_TOP = 36;

/** Fallback einzelner Punkt (ohne Home-Logik): Region-Zoom. */
const SINGLE_POINT_LAT_DELTA = 0.1;
const SINGLE_POINT_LON_DELTA = 0.11;

interface RealMapViewProps {
  origin?: GeoLocation | null;
  destination?: GeoLocation | null;
  polyline?: [number, number][];
  style?: object;
  centerKey?: number;
  driverMarker?: { lat: number; lon: number } | null;
  customerLiveMarker?: { lat: number; lon: number } | null;
  edgePaddingTop?: number;
  edgePaddingBottom?: number;
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
  edgePaddingTop = 200,
  edgePaddingBottom = 280,
  userLocation,
}: RealMapViewProps) {
  const colors = useColors();
  const mapRef = useRef<MapView>(null);
  const mapReadyRef = useRef(false);

  const fitMap = useCallback(() => {
    if (!mapRef.current) return;

    const originPoint =
      origin != null ? { latitude: origin.lat, longitude: origin.lon } : null;
    const destPoint =
      destination != null ? { latitude: destination.lat, longitude: destination.lon } : null;
    const gpsPoint =
      userLocation != null ? { latitude: userLocation.lat, longitude: userLocation.lon } : null;

    const padding = {
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

    const center = gpsPoint ?? originPoint;
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
  ]);

  const handleMapReady = useCallback(() => {
    mapReadyRef.current = true;
    setTimeout(fitMap, 300);
  }, [fitMap]);

  useEffect(() => {
    if (!mapReadyRef.current) return;
    fitMap();
  }, [fitMap, centerKey]);

  const routeCoords =
    polyline?.map(([lat, lon]) => ({ latitude: lat, longitude: lon })) ?? [];

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
      provider={PROVIDER_GOOGLE}
      showsUserLocation
      showsMyLocationButton={false}
      showsCompass={false}
      toolbarEnabled={false}
      mapPadding={homeMapPadding}
      onMapReady={handleMapReady}
    >
      {destination && (
        <Marker
          coordinate={{ latitude: destination.lat, longitude: destination.lon }}
          title={destination.displayName.split(",")[0]}
          pinColor="#EF4444"
        />
      )}
      {driverMarker && (
        <Marker
          coordinate={{ latitude: driverMarker.lat, longitude: driverMarker.lon }}
          title="Ihr Fahrer"
          pinColor="#2563EB"
        />
      )}
      {customerLiveMarker && (
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
