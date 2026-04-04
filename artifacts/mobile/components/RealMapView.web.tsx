import { MapPlaceholder } from "@/components/MapPlaceholder";
import { type GeoLocation } from "@/utils/routing";

interface RealMapViewProps {
  origin?: GeoLocation | null;
  destination?: GeoLocation | null;
  polyline?: [number, number][];
  style?: object;
}

export function RealMapView({ origin, destination, style }: RealMapViewProps) {
  return <MapPlaceholder origin={origin} destination={destination} style={style} />;
}
