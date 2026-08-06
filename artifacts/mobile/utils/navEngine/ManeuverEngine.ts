/**
 * Nächstes Manöver entlang der Steps (Depart überspringen, Distanz entlang Polyline).
 */

import { distanceAlongPolylineToPointM } from "../routeRemainingAlongPolyline";
import { splitNavStepParts } from "../navTurnDistanceCue";
import type { LatLon, NavManeuverOut, NavRouteStep } from "./types";

function isDepartStep(s: NavRouteStep | undefined): boolean {
  const instr = (s?.instruction ?? "").trim().toLowerCase();
  return (
    instr === "fahrt beginnen" ||
    instr.startsWith("fahrt beginnen") ||
    instr === "depart" ||
    instr.includes("abschließen der route")
  );
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

function isValid(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

export function advanceManeuverStepIdx(
  steps: NavRouteStep[],
  stepIdx: number,
  current: LatLon,
): number {
  if (steps.length === 0) return 0;
  let displayIdx = Math.max(0, Math.min(stepIdx, steps.length - 1));
  while (displayIdx < steps.length - 1 && isDepartStep(steps[displayIdx])) {
    displayIdx += 1;
  }

  let minD = Infinity;
  let closest = displayIdx;
  for (let i = displayIdx; i < steps.length; i++) {
    const s = steps[i]!;
    if (!isValid(s.lat, s.lon)) continue;
    const d = haversineM(current, { lat: s.lat, lon: s.lon });
    if (d < minD) {
      minD = d;
      closest = i;
    }
  }
  let nextIdx = displayIdx;
  if (minD < 35 && closest < steps.length - 1) {
    nextIdx = Math.min(closest + 1, steps.length - 1);
    while (nextIdx < steps.length - 1 && isDepartStep(steps[nextIdx])) {
      nextIdx += 1;
    }
  }
  return nextIdx;
}

export function buildManeuverOut(
  steps: NavRouteStep[],
  stepIdx: number,
  polyline: LatLon[],
  current: LatLon,
  guidanceStale: boolean,
): { maneuver: NavManeuverOut | null; distToManeuverM: number; stepIdx: number } {
  if (guidanceStale || steps.length === 0) {
    return { maneuver: null, distToManeuverM: 0, stepIdx };
  }
  const idx = advanceManeuverStepIdx(steps, stepIdx, current);
  const active = steps[idx];
  if (!active) return { maneuver: null, distToManeuverM: 0, stepIdx: idx };

  let distToManeuverM = 0;
  if (isValid(active.lat, active.lon)) {
    const liveM = distanceAlongPolylineToPointM(
      polyline,
      current,
      { lat: active.lat, lon: active.lon },
    );
    distToManeuverM =
      liveM ??
      Math.max(0, Math.round(haversineM(current, { lat: active.lat, lon: active.lon })));
  } else if (active.distanceM > 0) {
    distToManeuverM = active.distanceM;
  }

  const parts = splitNavStepParts(active);
  const next = steps[idx + 1];
  const nextParts = next ? splitNavStepParts(next) : null;

  return {
    stepIdx: idx,
    distToManeuverM,
    maneuver: {
      stepIdx: idx,
      instruction: active.instruction,
      maneuver: parts.maneuver,
      roadName: parts.roadName,
      distanceM: distToManeuverM,
      nextManeuver: nextParts?.maneuver ?? null,
      nextRoadName: nextParts?.roadName ?? null,
    },
  };
}
