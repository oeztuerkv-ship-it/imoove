export type RoutePoint = { latitude: number; longitude: number };

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function lerpCoord(a: RoutePoint, b: RoutePoint, t: number): RoutePoint {
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}

export function buildCumulativeDistances(points: RoutePoint[]): number[] {
  if (points.length === 0) return [];
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(
      cum[i - 1]! +
        haversineM(
          points[i - 1]!.latitude,
          points[i - 1]!.longitude,
          points[i]!.latitude,
          points[i]!.longitude,
        ),
    );
  }
  return cum;
}

function pointAtDistance(points: RoutePoint[], cumDist: number[], distM: number): RoutePoint {
  if (points.length === 0) return { latitude: 0, longitude: 0 };
  const total = cumDist[cumDist.length - 1] ?? 0;
  const clamped = Math.max(0, Math.min(distM, total));
  if (clamped <= 0) return points[0]!;
  if (clamped >= total) return points[points.length - 1]!;

  let lo = 0;
  let hi = cumDist.length - 1;
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (cumDist[mid]! <= clamped) lo = mid;
    else hi = mid;
  }

  const segStart = cumDist[lo]!;
  const segEnd = cumDist[hi]!;
  const segLen = segEnd - segStart || 1;
  const t = (clamped - segStart) / segLen;
  return lerpCoord(points[lo]!, points[hi]!, t);
}

export function slicePolylineSegment(
  points: RoutePoint[],
  cumDist: number[],
  startM: number,
  endM: number,
): RoutePoint[] {
  if (points.length < 2) return [];
  const total = cumDist[cumDist.length - 1] ?? 0;
  if (total <= 0) return [];

  const start = Math.max(0, Math.min(startM, total));
  const end = Math.max(start, Math.min(endM, total));
  if (end - start < 0.5) return [];

  const result: RoutePoint[] = [pointAtDistance(points, cumDist, start)];

  for (let i = 1; i < points.length - 1; i++) {
    const d = cumDist[i]!;
    if (d > start && d < end) result.push(points[i]!);
  }

  const endPoint = pointAtDistance(points, cumDist, end);
  const last = result[result.length - 1];
  if (
    !last ||
    Math.abs(last.latitude - endPoint.latitude) > 1e-7 ||
    Math.abs(last.longitude - endPoint.longitude) > 1e-7
  ) {
    result.push(endPoint);
  }

  return result.length >= 2 ? result : [];
}

export type RouteEnergyPulse = {
  /** Weicher Schweif hinter dem Impuls */
  trail: RoutePoint[];
  /** Heller Energie-Kern */
  core: RoutePoint[];
  /** Spitze / Zündfunke am Kopf */
  spark: RoutePoint[];
};

/**
 * Uber-ähnlicher Lichtimpuls: progress 0→1 = Start→Ziel entlang der Route.
 */
export function buildRouteEnergyPulse(
  points: RoutePoint[],
  cumDist: number[],
  progress: number,
): RouteEnergyPulse {
  const empty: RouteEnergyPulse = { trail: [], core: [], spark: [] };
  const total = cumDist[cumDist.length - 1] ?? 0;
  if (total <= 0 || points.length < 2) return empty;

  const pulseLen = Math.min(220, Math.max(75, total * 0.1));
  const head = progress * total;
  const tail = Math.max(0, head - pulseLen);

  return {
    trail: slicePolylineSegment(points, cumDist, tail, head - pulseLen * 0.38),
    core: slicePolylineSegment(points, cumDist, head - pulseLen * 0.38, head - pulseLen * 0.1),
    spark: slicePolylineSegment(points, cumDist, head - pulseLen * 0.1, head),
  };
}
