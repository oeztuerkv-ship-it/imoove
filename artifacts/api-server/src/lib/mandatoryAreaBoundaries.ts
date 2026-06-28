/**
 * Taxameter-Pflichtgebiet — Punkt-in-Polygon gegen amtliche Verwaltungsgrenzen (GeoJSON).
 * Daten: `src/data/mandatory-area-boundaries/mandatory-taxi-areas.geojson` (OSM/Overpass, ODbL).
 * Aktualisieren: `node scripts/fetch-mandatory-area-boundaries.mjs`
 */
import mandatoryTaxiAreas from "../data/mandatory-area-boundaries/mandatory-taxi-areas.geojson";

export type MandatoryAreaPolygonId = "stuttgart-stadtkreis" | "landkreis-esslingen";

type Position = [number, number];
type PolygonCoords = Position[][];
type MultiPolygonCoords = Position[][][];

type GeoGeometry =
  | { type: "Polygon"; coordinates: PolygonCoords }
  | { type: "MultiPolygon"; coordinates: MultiPolygonCoords };

type GeoFeature = {
  type: "Feature";
  properties: { id: MandatoryAreaPolygonId; name: string };
  geometry: GeoGeometry;
};

const FEATURES = (mandatoryTaxiAreas as { features: GeoFeature[] }).features;

function pointInRing(lon: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygonCoords(lon: number, lat: number, coords: PolygonCoords): boolean {
  if (coords.length === 0 || !coords[0]?.length) return false;
  if (!pointInRing(lon, lat, coords[0]!)) return false;
  for (let h = 1; h < coords.length; h++) {
    if (pointInRing(lon, lat, coords[h]!)) return false;
  }
  return true;
}

function pointInGeometry(lon: number, lat: number, geometry: GeoGeometry): boolean {
  if (geometry.type === "Polygon") {
    return pointInPolygonCoords(lon, lat, geometry.coordinates);
  }
  return geometry.coordinates.some((poly) => pointInPolygonCoords(lon, lat, poly));
}

export function mandatoryAreaIdsForCoordinates(lat: number, lon: number): MandatoryAreaPolygonId[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  const hits: MandatoryAreaPolygonId[] = [];
  for (const feature of FEATURES) {
    const id = feature.properties?.id;
    if (!id) continue;
    if (pointInGeometry(lon, lat, feature.geometry)) hits.push(id);
  }
  return hits;
}

export function isMandatoryTaxiAreaByCoordinates(lat: number, lon: number): boolean {
  return mandatoryAreaIdsForCoordinates(lat, lon).length > 0;
}

/** Für Tests: Grenzpunkte ±offsetM entlang einer Richtung bis zum Wechsel inside/outside. */
export function findBoundaryProbePoints(args: {
  startLat: number;
  startLon: number;
  bearingDeg: number;
  stepM?: number;
  offsetM?: number;
  maxSteps?: number;
  isInside: (lat: number, lon: number) => boolean;
}): { inside: { lat: number; lon: number }; outside: { lat: number; lon: number } } | null {
  const stepM = args.stepM ?? 100;
  const offsetM = args.offsetM ?? 500;
  const maxSteps = args.maxSteps ?? 300;
  let prev = { lat: args.startLat, lon: args.startLon };
  let prevInside = args.isInside(prev.lat, prev.lon);
  if (!prevInside) return null;

  for (let i = 1; i <= maxSteps; i++) {
    const dist = i * stepM;
    const rad = (args.bearingDeg * Math.PI) / 180;
    const R = 6371000;
    const lat1 = (prev.lat * Math.PI) / 180;
    const lon1 = (prev.lon * Math.PI) / 180;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(dist / R) +
        Math.cos(lat1) * Math.sin(dist / R) * Math.cos(rad),
    );
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(rad) * Math.sin(dist / R) * Math.cos(lat1),
        Math.cos(dist / R) - Math.sin(lat1) * Math.sin(lat2),
      );
    const cur = { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
    const curInside = args.isInside(cur.lat, cur.lon);
    if (curInside !== prevInside) {
      const anchor = prevInside ? prev : cur;
      const sign = prevInside ? -1 : 1;
      const rad2 = (args.bearingDeg * Math.PI) / 180;
      const mk = (m: number) => {
        const latA = (anchor.lat * Math.PI) / 180;
        const lonA = (anchor.lon * Math.PI) / 180;
        const d = sign * m;
        const latB = Math.asin(
          Math.sin(latA) * Math.cos(d / R) +
            Math.cos(latA) * Math.sin(d / R) * Math.cos(rad2),
        );
        const lonB =
          lonA +
          Math.atan2(
            Math.sin(rad2) * Math.sin(d / R) * Math.cos(latA),
            Math.cos(d / R) - Math.sin(latA) * Math.sin(latB),
          );
        return { lat: (latB * 180) / Math.PI, lon: (lonB * 180) / Math.PI };
      };
      return { inside: mk(offsetM), outside: mk(-offsetM) };
    }
    prev = cur;
    prevInside = curInside;
  }
  return null;
}
