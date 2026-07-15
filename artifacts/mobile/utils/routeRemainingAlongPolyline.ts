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

  let bestDist = Infinity;
  let bestSeg = 0;
  let bestT = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const proj = projectOnSegment(current, polyline[i]!, polyline[i + 1]!);
    if (proj.distM < bestDist) {
      bestDist = proj.distM;
      bestSeg = i;
      bestT = proj.t;
    }
  }

  let remainingM = (1 - bestT) * (segLens[bestSeg] ?? 0);
  for (let i = bestSeg + 1; i < segLens.length; i++) {
    remainingM += segLens[i]!;
  }

  remainingM = Math.max(0, Math.min(totalM, remainingM));
  const fractionLeft = Math.max(0, Math.min(1, remainingM / totalM));
  return { remainingM, totalM, fractionLeft };
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
