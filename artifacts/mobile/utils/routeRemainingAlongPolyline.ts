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
 * Achtung: misst gegen die **gesamte** Linie inkl. Abgefahrenem — für Reroute
 * besser `distanceToForwardPolylineM` nutzen.
 */
export function distanceToPolylineM(polyline: LatLon[], current: LatLon): number | null {
  const n = nearestOnPolyline(polyline, current);
  return n ? n.bestDistM : null;
}

/**
 * Fortschritt (m) entlang der Polyline bis zur Projektion des aktuellen Punkts.
 */
export function progressAlongPolylineAt(polyline: LatLon[], current: LatLon): number | null {
  const n = nearestOnPolyline(polyline, current);
  if (!n) return null;
  return progressAlongPolylineM(n);
}

/**
 * Querabstand nur zur **Rest-Route** ab `fromProgressM` (nicht zur abgefahrenen Spur).
 *
 * Repro Falschabbiegen: Nach Abbiegen bleibt man oft nahe der alten Linie hinter dem
 * Puck → `distanceToPolylineM` ≈ 0 und kein Reroute. Forward-only erkennt das.
 *
 * Wichtig: Bei Segmenten, die `fromProgressM` überdecken, nur den Teil **ab** fromProgress
 * werten — sonst zählt die abgefahrene Hälfte des aktuellen Segments noch mit.
 */
export function distanceToForwardPolylineM(
  polyline: LatLon[],
  current: LatLon,
  fromProgressM: number,
): number | null {
  if (polyline.length < 2) return null;
  if (!Number.isFinite(current.lat) || !Number.isFinite(current.lon)) return null;
  const minProg = Math.max(0, Number.isFinite(fromProgressM) ? fromProgressM : 0);

  let cum = 0;
  let bestDistM = Infinity;
  let any = false;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i]!;
    const b = polyline[i + 1]!;
    const len = haversineM(a, b);
    const segStart = cum;
    const segEnd = cum + len;
    cum = segEnd;
    if (segEnd < minProg - 0.5) continue;
    any = true;
    if (len < 0.5) continue;
    if (segStart >= minProg - 0.5) {
      const proj = projectOnSegment(current, a, b);
      if (proj.distM < bestDistM) bestDistM = proj.distM;
    } else {
      // Nur Rest des Segments ab minProg
      const t0 = Math.max(0, Math.min(1, (minProg - segStart) / len));
      const a2: LatLon = {
        lat: a.lat + (b.lat - a.lat) * t0,
        lon: a.lon + (b.lon - a.lon) * t0,
      };
      const proj = projectOnSegment(current, a2, b);
      if (proj.distM < bestDistM) bestDistM = proj.distM;
    }
  }
  if (!any || !Number.isFinite(bestDistM)) return null;
  return bestDistM;
}

/**
 * Fortschritt nur vorwärts fortschreiben (kein Snap zurück auf abgefahrene Spur).
 * Bei großem Querabstand Fortschritt nicht aus der Projektion übernehmen.
 */
export function advanceRouteProgressM(
  committedProgressM: number,
  polyline: LatLon[],
  current: LatLon,
  opts?: { maxLateralForAdvanceM?: number },
): number {
  const maxLat = opts?.maxLateralForAdvanceM ?? 40;
  const n = nearestOnPolyline(polyline, current);
  if (!n) return committedProgressM;
  if (n.bestDistM > maxLat) return committedProgressM;
  const p = progressAlongPolylineM(n);
  return Math.max(committedProgressM, p);
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

/**
 * Route am Fahrer splitten: abgefahren (blau zurück) vs. Rest (Glow voraus).
 */
export function splitPolylineAtProgress(
  polyline: LatLon[],
  current: LatLon,
): { traveled: LatLon[]; remaining: LatLon[] } | null {
  const n = nearestOnPolyline(polyline, current);
  if (!n || polyline.length < 2) return null;

  const a = polyline[n.bestSeg]!;
  const b = polyline[n.bestSeg + 1]!;
  const snap: LatLon = {
    lat: a.lat + n.bestT * (b.lat - a.lat),
    lon: a.lon + n.bestT * (b.lon - a.lon),
  };

  const traveled: LatLon[] = [];
  for (let i = 0; i <= n.bestSeg; i++) traveled.push(polyline[i]!);
  if (n.bestT > 0.02) traveled.push(snap);
  // Am Start: keine sichtbare Spur hinter dem Puck
  if (n.bestSeg === 0 && n.bestT < 0.02) traveled.length = 0;

  const remaining: LatLon[] = [snap];
  for (let i = n.bestSeg + 1; i < polyline.length; i++) remaining.push(polyline[i]!);
  // Am Ziel: Rest leer
  if (n.bestSeg >= polyline.length - 2 && n.bestT > 0.98) {
    remaining.length = 0;
  }

  return {
    traveled: traveled.length >= 2 ? traveled : [],
    remaining: remaining.length >= 2 ? remaining : [],
  };
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
