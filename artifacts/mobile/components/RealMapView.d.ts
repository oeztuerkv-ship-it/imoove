import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import { type GeoLocation } from "@/utils/routing";

interface RealMapViewProps {
  origin?: GeoLocation | null;
  destination?: GeoLocation | null;
  polyline?: [number, number][];
  style?: StyleProp<ViewStyle>;
  centerKey?: number;
  edgePaddingBottom?: number;
  driverMarker?: { lat: number; lon: number; heading?: number } | null;
  customerLiveMarker?: { lat: number; lon: number } | null;
  [key: string]: unknown;
}

export declare function RealMapView(props: RealMapViewProps): React.JSX.Element | null;
