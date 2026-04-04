import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";

import { useColors } from "@/hooks/useColors";
import { type GeoLocation } from "@/utils/routing";

const DEFAULT_REGION = {
  latitude: 48.7394,
  longitude: 9.3114,
  latitudeDelta: 0.025,
  longitudeDelta: 0.025,
};

interface RealMapViewProps {
  origin?: GeoLocation | null;
  destination?: GeoLocation | null;
  polyline?: [number, number][];
  style?: object;
  centerKey?: number;
  driverMarker?: { lat: number; lon: number } | null;
  customerLiveMarker?: { lat: number; lon: number } | null;
  edgePaddingBottom?: number;
}

export function RealMapView({
  origin,
  destination,
  polyline,
  style,
  centerKey,
  driverMarker,
  customerLiveMarker,
  edgePaddingBottom = 320,
}: RealMapViewProps) {
  const colors = useColors();
  const mapRef = useRef<MapView>(null);
  const mapReadyRef = useRef(false);

  const fitMap = useCallback(() => {
    if (!mapRef.current) return;
    const points: { latitude: number; longitude: number }[] = [];
    if (origin) points.push({ latitude: origin.lat, longitude: origin.lon });
    if (destination) points.push({ latitude: destination.lat, longitude: destination.lon });

    if (points.length === 2) {
      mapRef.current.fitToCoordinates(points, {
        edgePadding: { top: 130, right: 60, bottom: edgePaddingBottom, left: 60 },
        animated: true,
      });
    } else if (points.length === 1) {
      mapRef.current.animateToRegion(
        {
          latitude: points[0].latitude - 0.007,
          longitude: points[0].longitude,
          latitudeDelta: 0.035,
          longitudeDelta: 0.035,
        },
        600,
      );
    }
  }, [origin?.lat, origin?.lon, destination?.lat, destination?.lon, edgePaddingBottom]);

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
