import { bearingDegrees } from "./liveDriverMarkerMotion";

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

/**
 * Lateral auf die Route snappen (nur Anzeige). Null wenn zu weit abseits / keine Route.
 * Off-Route-Messung weiterhin mit Roh-/EMA-GPS, nicht mit dem Snapped-Punkt.
 */
export function snapLatLonToPolyline(
  polyline: LatLon[],
  current: LatLon,
  maxLateralM: number = 28,
): LatLon | null {
  const n = nearestOnPolyline(polyline, current);
  if (!n || !Number.isFinite(n.bestDistM) || n.bestDistM > maxLateralM) return null;
  if (n.bestSeg < 0 || n.bestSeg >= polyline.length - 1) return null;
  const a = polyline[n.bestSeg]!;
  const b = polyline[n.bestSeg + 1]!;
  return {
    lat: a.lat + n.bestT * (b.lat - a.lat),
    lon: a.lon + n.bestT * (b.lon - a.lon),
  };
}

/**
 * Fahrtrichtung entlang der Route: Bearing vom Projizierten Punkt zu einem
 * Punkt ~`lookaheadM` voraus (nicht Einzel-Segment-Tangente).
 * Stabiler an kurzen Kurven/Kreuzungen — verhindert Kamera-Flip-Flop.
 */
export function bearingAlongPolylineLookaheadDeg(
  polyline: LatLon[],
  current: LatLon,
  lookaheadM: number = 70,
): number | null {
  const n = nearestOnPolyline(polyline, current);
  if (!n || polyline.length < 2) return null;
  const look = Math.max(15, lookaheadM);

  const seg0 = polyline[n.bestSeg]!;
  const seg1 = polyline[n.bestSeg + 1]!;
  const start: LatLon = {
    lat: seg0.lat + (seg1.lat - seg0.lat) * n.bestT,
    lon: seg0.lon + (seg1.lon - seg0.lon) * n.bestT,
  };

  let remaining = look;
  let i = n.bestSeg;
  let t = n.bestT;
  while (i < polyline.length - 1) {
    const len = n.segLens[i] ?? haversineM(polyline[i]!, polyline[i + 1]!);
    if (len < 0.5) {
      i += 1;
      t = 0;
      continue;
    }
    const remOnSeg = (1 - t) * len;
    if (remaining <= remOnSeg) {
      const tEnd = t + remaining / len;
      const a = polyline[i]!;
      const b = polyline[i + 1]!;
      const end: LatLon = {
        lat: a.lat + (b.lat - a.lat) * tEnd,
        lon: a.lon + (b.lon - a.lon) * tEnd,
      };
      if (haversineM(start, end) < 2) break;
      return bearingDegrees(start.lat, start.lon, end.lat, end.lon);
    }
    remaining -= remOnSeg;
    i += 1;
    t = 0;
  }

  const last = polyline[polyline.length - 1]!;
  if (haversineM(start, last) < 2) {
    return bearingAlongNearestPolylineSegmentDeg(polyline, current);
  }
  return bearingDegrees(start.lat, start.lon, last.lat, last.lon);
}

/**
 * Fahrtrichtung entlang der nächsten Polyline-Kante (° von Norden).
 * Vorausschau aufs nächste Segment erst kurz vor dem Segmentende (~35 m).
 * Für Kamera-Heading bevorzugt `bearingAlongPolylineLookaheadDeg` nutzen.
 */
export function bearingAlongNearestPolylineSegmentDeg(
  polyline: LatLon[],
  current: LatLon,
): number | null {
  const n = nearestOnPolyline(polyline, current);
  if (!n || polyline.length < 2) return null;
  let i = n.bestSeg;
  const segLen = n.segLens[i] ?? 0;
  const remOnSegM = Math.max(0, (1 - n.bestT) * segLen);
  if (remOnSegM <= 35 && i + 2 < polyline.length) {
    i += 1;
  }
  const a = polyline[i];
  const b = polyline[i + 1];
  if (!a || !b) return null;
  if (haversineM(a, b) < 1.5) {
    for (let j = i + 1; j < polyline.length - 1; j++) {
      const c = polyline[j]!;
      const d = polyline[j + 1]!;
      if (haversineM(c, d) >= 1.5) {
        return bearingDegrees(c.lat, c.lon, d.lat, d.lon);
      }
    }
  }
  return bearingDegrees(a.lat, a.lon, b.lat, b.lon);
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
