/** Polyline für Kunden-Sharing: wenige Punkte, Start+Ende bleiben erhalten. */

export const DRIVER_ROUTE_SHARE_MAX_POINTS = 100;

export type DriverRouteLatLon = { lat: number; lon: number };

/** Gleichmäßig ausdünnen — genug für Kartenzeichnung, klein genug für WS. */
export function downsampleRoutePolyline(
  points: DriverRouteLatLon[],
  maxPoints: number = DRIVER_ROUTE_SHARE_MAX_POINTS,
): DriverRouteLatLon[] {
  if (points.length <= maxPoints) return points;
  if (maxPoints < 2) return points.slice(0, Math.max(0, maxPoints));
  const last = points.length - 1;
  const out: DriverRouteLatLon[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = i === maxPoints - 1 ? last : Math.round((i * last) / (maxPoints - 1));
    const p = points[idx];
    if (!p) continue;
    const prev = out[out.length - 1];
    if (prev && prev.lat === p.lat && prev.lon === p.lon) continue;
    out.push(p);
  }
  return out;
}

export function polylinePairsFromLatLon(points: DriverRouteLatLon[]): [number, number][] {
  return points.map((p) => [p.lat, p.lon]);
}
