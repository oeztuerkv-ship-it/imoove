/**
 * RouteProgressEngine (Schritt 3) — eine kanonische Progress-Quelle pro Route-Generation.
 *
 * Kanonisch: `committedProgressM` (nur vorwärts, an aktuelle Generation gebunden).
 * Daraus: Reststrecke (Poly + Matrix-Skalierung), Forward-Lateral, Glow-Split,
 * Distanz zum Manöver-Punkt.
 *
 * Nicht: nearest-full-Polyline als parallele Progress-Wahrheit für UI/ETA.
 */

import {
  NAV_ROUTE_PROGRESS_BACKTRACK_M,
  NAV_ROUTE_PROGRESS_MAX_LATERAL_M,
} from "../navOffRouteReroute";
import {
  advanceRouteProgressM,
  distanceToForwardPolylineM,
  progressAlongPolylineAt,
  scaleRemainingToAuthoritative,
  type LatLon,
  type RemainingAlongRoute,
} from "../routeRemainingAlongPolyline";

export type RouteProgressTickInput = {
  polyline: LatLon[];
  /** Position zum Fortschreiben (Display-Pose wenn gematcht, sonst Filter). */
  at: LatLon;
  committedProgressM: number;
  routeGeneration: number;
  /** Snapshot-Generation — bei Mismatch kein Fortschritt auf alter Geometrie. */
  snapshotGeneration: number;
  authoritativeDistM: number;
  authoritativeEtaMin: number;
  /** false während Reroute: Progress einfrieren (alte Geometrie invalid für Anzeige). */
  allowAdvance: boolean;
};

export type RouteProgressTickResult = {
  committedProgressM: number;
  totalPolyM: number;
  remainingPolyM: number;
  fractionLeft: number;
  /** Querabstand zur Rest-Route ab committed (für Off-Route). */
  forwardDistM: number | null;
  remainingDistM: number;
  remainingMin: number;
  /** true wenn Snapshot-Generation veraltet — kein Progress aus alter Route. */
  staleGeneration: boolean;
};

export function polylineLengthM(polyline: LatLon[]): number {
  if (polyline.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    total += haversineM(polyline[i]!, polyline[i + 1]!);
  }
  return total;
}

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

/** Rest entlang Polyline aus committed Progress (nicht nearest-full). */
export function remainingFromCommittedProgress(
  polyline: LatLon[],
  committedProgressM: number,
): RemainingAlongRoute | null {
  const totalM = polylineLengthM(polyline);
  if (totalM <= 0) return null;
  const progress = Math.max(0, Math.min(totalM, committedProgressM));
  const remainingM = Math.max(0, totalM - progress);
  const fractionLeft = Math.max(0, Math.min(1, remainingM / totalM));
  return { remainingM, totalM, fractionLeft };
}

/**
 * Distanz entlang Route von committed Progress bis Zielpunkt (Step/Manöver).
 * Kein nearest-current → nearest-target (vermeidet Sprünge auf abgefahrene Spur).
 */
export function distanceAlongRouteFromProgressM(
  polyline: LatLon[],
  committedProgressM: number,
  target: LatLon,
): number | null {
  if (polyline.length < 2) return null;
  const toProg = progressAlongPolylineAt(polyline, target);
  if (toProg == null || !Number.isFinite(toProg)) return null;
  const from = Math.max(0, committedProgressM);
  if (toProg >= from - 2) return Math.max(0, Math.round(toProg - from));
  return 0;
}

/** Glow: Split bei committed Meterstand (nicht nearest-LatLon). */
export function splitPolylineAtCommittedProgressM(
  polyline: LatLon[],
  committedProgressM: number,
): { traveled: LatLon[]; remaining: LatLon[] } | null {
  if (polyline.length < 2) return null;
  const totalM = polylineLengthM(polyline);
  if (totalM <= 0) return null;
  const target = Math.max(0, Math.min(totalM, committedProgressM));

  let cum = 0;
  let bestSeg = 0;
  let bestT = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i]!;
    const b = polyline[i + 1]!;
    const len = haversineM(a, b);
    if (cum + len >= target - 1e-6 || i === polyline.length - 2) {
      bestSeg = i;
      bestT = len < 0.5 ? 1 : Math.max(0, Math.min(1, (target - cum) / len));
      break;
    }
    cum += len;
  }

  const a = polyline[bestSeg]!;
  const b = polyline[bestSeg + 1]!;
  const snap: LatLon = {
    lat: a.lat + bestT * (b.lat - a.lat),
    lon: a.lon + bestT * (b.lon - a.lon),
  };

  const traveled: LatLon[] = [];
  for (let i = 0; i <= bestSeg; i++) traveled.push(polyline[i]!);
  if (bestT > 0.02) traveled.push(snap);
  if (bestSeg === 0 && bestT < 0.02) traveled.length = 0;

  const remaining: LatLon[] = [snap];
  for (let i = bestSeg + 1; i < polyline.length; i++) remaining.push(polyline[i]!);
  if (bestSeg >= polyline.length - 2 && bestT > 0.98) remaining.length = 0;

  return {
    traveled: traveled.length >= 2 ? traveled : [],
    remaining: remaining.length >= 2 ? remaining : [],
  };
}

/** Progress bei neuer Route (Generation) von Pose neu initialisieren. */
export function initCommittedProgressForRoute(
  polyline: LatLon[],
  at: LatLon,
): number {
  return advanceRouteProgressM(0, polyline, at, {
    maxLateralForAdvanceM: NAV_ROUTE_PROGRESS_MAX_LATERAL_M,
  });
}

/**
 * Ein Progress-Tick: Advance (optional) → Remaining/ETA/Forward aus demselben committed Stand.
 */
export function tickRouteProgress(input: RouteProgressTickInput): RouteProgressTickResult {
  const staleGeneration =
    input.snapshotGeneration > 0 &&
    input.routeGeneration > 0 &&
    input.snapshotGeneration < input.routeGeneration;

  if (staleGeneration || input.polyline.length < 2) {
    return {
      committedProgressM: input.committedProgressM,
      totalPolyM: 0,
      remainingPolyM: 0,
      fractionLeft: 0,
      forwardDistM: null,
      remainingDistM: 0,
      remainingMin: 1,
      staleGeneration: true,
    };
  }

  let committed = input.committedProgressM;
  if (input.allowAdvance) {
    committed = advanceRouteProgressM(committed, input.polyline, input.at, {
      maxLateralForAdvanceM: NAV_ROUTE_PROGRESS_MAX_LATERAL_M,
    });
  }

  const along = remainingFromCommittedProgress(input.polyline, committed);
  const totalPolyM = along?.totalM ?? polylineLengthM(input.polyline);
  const remainingPolyM = along?.remainingM ?? 0;
  const fractionLeft = along?.fractionLeft ?? 0;

  const fromProg = Math.max(0, committed - NAV_ROUTE_PROGRESS_BACKTRACK_M);
  const forwardDistM = distanceToForwardPolylineM(input.polyline, input.at, fromProg);

  let remainingDistM = 0;
  let remainingMin = 1;
  if (along && input.authoritativeDistM > 0) {
    const scaled = scaleRemainingToAuthoritative(
      along,
      input.authoritativeDistM,
      input.authoritativeEtaMin,
    );
    remainingDistM = scaled.remainingDistM;
    remainingMin = scaled.remainingMin;
  } else if (input.authoritativeDistM > 0) {
    remainingDistM = Math.round(input.authoritativeDistM * fractionLeft);
    remainingMin = Math.max(1, Math.round(input.authoritativeEtaMin * fractionLeft));
  }

  return {
    committedProgressM: committed,
    totalPolyM,
    remainingPolyM,
    fractionLeft,
    forwardDistM,
    remainingDistM,
    remainingMin,
    staleGeneration: false,
  };
}
