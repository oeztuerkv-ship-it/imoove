/** Restdistanz entlang einer Straßen-Polyline (nicht Luftlinie). */

export type LatLon = { lat: number; lon: number };

function haversineM(a: LatLon, b: LatLon): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function projectOnSegment(p: LatLon, a: LatLon, b: LatLon): {
  point: LatLon;
  t: number;
  distM: number;
} {
  const ax = a.lon;
  const ay = a.lat;
  const bx = b.lon;
  const by = b.lat;
  const px = p.lon;
  const py = p.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 1e-18) {
    t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
  }
  const point = { lat: ay + t * dy, lon: ax + t * dx };
  return { point, t, distM: haversineM(p, point) };
}

type NearestOnPolyline = {
  bestDistM: number;
  bestSeg: number;
  bestT: number;
  segLens: number[];
  totalM: number;
};

function nearestOnPolyline(polyline: LatLon[], current: LatLon): NearestOnPolyline | null {
  if (polyline.length < 2) return null;
  if (!Number.isFinite(current.lat) || !Number.isFinite(current.lon)) return null;

  const segLens: number[] = [];
  let totalM = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const len = haversineM(polyline[i]!, polyline[i + 1]!);
    segLens.push(len);
    totalM += len;
  }
  if (totalM <= 0) return null;

  let bestDistM = Infinity;
  let bestSeg = 0;
  let bestT = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const proj = projectOnSegment(current, polyline[i]!, polyline[i + 1]!);
    if (proj.distM < bestDistM) {
      bestDistM = proj.distM;
      bestSeg = i;
      bestT = proj.t;
    }
  }
  if (!Number.isFinite(bestDistM)) return null;
  return { bestDistM, bestSeg, bestT, segLens, totalM };
}

/**
 * Querabstand (m) zur nächsten Polyline-Kante — für Off-Route-Erkennung.
 */
export function distanceToPolylineM(polyline: LatLon[], current: LatLon): number | null {
  const n = nearestOnPolyline(polyline, current);
  return n ? n.bestDistM : null;
}

export type RemainingAlongRoute = {
  remainingM: number;
  totalM: number;
  /** Anteil der Reststrecke (0–1) entlang der Polyline. */
  fractionLeft: number;
};

/**
 * Nächster Punkt auf der Route → Summe ab dort bis Ziel.
 * Für Anzeige: mit Google-/Matrix-Gesamtwerten skalieren (`authoritativeTotalM * fractionLeft`).
 */
export function remainingAlongPolyline(
  polyline: LatLon[],
  current: LatLon,
): RemainingAlongRoute | null {
  const n = nearestOnPolyline(polyline, current);
  if (!n) return null;

  let remainingM = (1 - n.bestT) * (n.segLens[n.bestSeg] ?? 0);
  for (let i = n.bestSeg + 1; i < n.segLens.length; i++) {
    remainingM += n.segLens[i]!;
  }

  remainingM = Math.max(0, Math.min(n.totalM, remainingM));
  const fractionLeft = Math.max(0, Math.min(1, remainingM / n.totalM));
  return { remainingM, totalM: n.totalM, fractionLeft };
}

/** Meter entlang der Polyline vom Start bis zur Projektion. */
function progressAlongPolylineM(n: NearestOnPolyline): number {
  let done = 0;
  for (let i = 0; i < n.bestSeg; i++) done += n.segLens[i]!;
  done += n.bestT * (n.segLens[n.bestSeg] ?? 0);
  return done;
}

/**
 * Restdistanz entlang der Route vom aktuellen Standort bis zum Manöver-Punkt
 * (OSRM-Step lat/lon). Fallback: Luftlinie, wenn Polyline zu kurz.
 */
export function distanceAlongPolylineToPointM(
  polyline: LatLon[],
  current: LatLon,
  target: LatLon,
): number | null {
  if (!Number.isFinite(target.lat) || !Number.isFinite(target.lon)) return null;
  if (polyline.length < 2) {
    const air = haversineM(current, target);
    return Number.isFinite(air) ? Math.max(0, Math.round(air)) : null;
  }
  const from = nearestOnPolyline(polyline, current);
  const to = nearestOnPolyline(polyline, target);
  if (!from || !to) {
    const air = haversineM(current, target);
    return Number.isFinite(air) ? Math.max(0, Math.round(air)) : null;
  }
  const a = progressAlongPolylineM(from);
  const b = progressAlongPolylineM(to);
  if (b >= a - 2) return Math.max(0, Math.round(b - a));
  // Manöver hinter der Projektion (gerade passiert) → 0
  return 0;
}

/** Anzeige-Distanz/ETA skaliert auf autoritative Gesamtmesswerte (z. B. Google Matrix). */
export function scaleRemainingToAuthoritative(
  along: RemainingAlongRoute,
  authoritativeTotalM: number,
  authoritativeEtaMin: number,
): { remainingDistM: number; remainingMin: number } {
  const totalM = Math.max(1, authoritativeTotalM);
  const remainingDistM = Math.round(totalM * along.fractionLeft);
  const remainingMin = Math.max(
    1,
    Math.round(authoritativeEtaMin * along.fractionLeft),
  );
  return { remainingDistM, remainingMin };
}
