import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import { type GeoLocation } from "@/utils/routing";

interface RealMapViewProps {
  origin?: GeoLocation | null;
  destination?: GeoLocation | null;
  polyline?: [number, number][];
  style?: StyleProp<ViewStyle>;
  centerKey?: number;
  /** Abstand nach oben (Safe Area + Origin-Chip / FAB), damit die Karte darunter sichtbar bleibt. */
  edgePaddingTop?: number;
  edgePaddingBottom?: number;
  /** Echte GPS-Position – für Zoom/Fit statt nur Abhol-Adresse (blauer Punkt sichtbar). */
  userLocation?: { lat: number; lon: number } | null;
  driverMarker?: { lat: number; lon: number; heading?: number } | null;
  customerLiveMarker?: { lat: number; lon: number } | null;
  [key: string]: unknown;
}

export declare function RealMapView(props: RealMapViewProps): React.JSX.Element | null;
