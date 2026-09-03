/**
 * ManeuverEngine (Schritt 4) — Turn-by-Turn aus kanonischem RouteProgress + Route-Generation.
 *
 * - Step-Advance: committedProgressM vs. Manöver-Punkt entlang der Polyline
 * - Distanz: distanceAlongRouteFromProgressM (kein Haversine-Closest, kein nearest-current→target)
 * - Stale Generation / guidanceStale → keine Guidance
 */

import { progressAlongPolylineAt } from "../routeRemainingAlongPolyline";
import { splitNavStepParts } from "../navTurnDistanceCue";
import { distanceAlongRouteFromProgressM } from "./RouteProgressEngine";
import type { LatLon, ManeuverKind, NavManeuverOut, NavRouteStep } from "./types";

export type { ManeuverKind };

/** Manöver als passiert, wenn Rest entlang Route ≤ dieser Meter (an „Jetzt“-Schwelle angelehnt). */
export const NAV_MANEUVER_PASS_WITHIN_M = 25;

function isValid(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

export function isDepartStep(s: NavRouteStep | undefined): boolean {
  const instr = (s?.instruction ?? "").trim().toLowerCase();
  const man = (s?.maneuver ?? "").trim().toLowerCase();
  const t = `${instr} ${man}`;
  return (
    instr === "fahrt beginnen" ||
    instr.startsWith("fahrt beginnen") ||
    instr === "depart" ||
    man === "depart" ||
    t.includes("abschließen der route")
  );
}

export function isArriveStep(s: NavRouteStep | undefined): boolean {
  const instr = (s?.instruction ?? "").trim().toLowerCase();
  const man = (s?.maneuver ?? "").trim().toLowerCase();
  const t = `${instr} ${man}`;
  return (
    t.includes("ziel erreicht") ||
    t.includes("sie haben ihr ziel") ||
    man === "arrive" ||
    man === "destination" ||
    instr === "arrive" ||
    (t.includes("ziel") && (t.includes("erreicht") || t.includes("ankommen")))
  );
}

/** Klassifikation für Icon/Selftests (links/rechts/geradeaus/U-Turn/Kreisverkehr/Ziel). */
export function classifyManeuverKind(text: string): ManeuverKind {
  const i = (text ?? "").toLowerCase();
  if (!i.trim()) return "other";
  if (
    i.includes("ziel erreicht") ||
    i.includes("sie haben ihr ziel") ||
    i === "arrive" ||
    i === "destination" ||
    (i.includes("ziel") && (i.includes("erreicht") || i.includes("ankommen")))
  ) {
    return "arrive";
  }
  if (i.includes("fahrt beginnen") || i === "depart") return "depart";
  if (i.includes("kreisverkehr") || i.includes("roundabout") || i.includes("rotary")) {
    return "roundabout";
  }
  if (i.includes("wenden") || i.includes("u-turn") || i.includes("uturn") || i.includes("umkehren")) {
    return "uturn";
  }
  if (i.includes("rechts")) return "right";
  if (i.includes("links")) return "left";
  if (
    i.includes("geradeaus") ||
    i.includes("weiterfahren") ||
    i.includes("weiter auf") ||
    i.includes("continue") ||
    i.includes("straight")
  ) {
    return "straight";
  }
  return "other";
}

function skipDepartForward(steps: NavRouteStep[], idx: number): number {
  let i = Math.max(0, Math.min(idx, Math.max(0, steps.length - 1)));
  while (i < steps.length - 1 && isDepartStep(steps[i])) i += 1;
  return i;
}

/**
 * Nächster Step-Index anhand committed Progress (kein Haversine-Closest).
 */
export function advanceManeuverStepIdx(
  steps: NavRouteStep[],
  stepIdx: number,
  polyline: LatLon[],
  committedProgressM: number,
): number {
  if (steps.length === 0) return 0;
  let idx = skipDepartForward(steps, stepIdx);
  const progress = Math.max(0, committedProgressM);

  while (idx < steps.length - 1) {
    const step = steps[idx]!;
    if (isArriveStep(step)) break;

    if (isValid(step.lat, step.lon)) {
      const dist = distanceAlongRouteFromProgressM(polyline, progress, {
        lat: step.lat,
        lon: step.lon,
      });
      const stepProg = progressAlongPolylineAt(polyline, { lat: step.lat, lon: step.lon });
      const passedByDist = dist != null && dist <= NAV_MANEUVER_PASS_WITHIN_M;
      const passedByProgress =
        stepProg != null && Number.isFinite(stepProg) && progress >= stepProg - 1;
      if (passedByDist || passedByProgress) {
        idx = skipDepartForward(steps, idx + 1);
        continue;
      }
    }
    break;
  }
  return idx;
}

export type BuildManeuverOpts = {
  committedProgressM: number;
  /** Generation des aktuellen Route-Snapshots. */
  routeGeneration: number;
  /** In der Engine gebundene Generation (nach commitNavigationRoute). */
  boundRouteGeneration: number;
};

/**
 * Guidance aus Progress + Steps der aktuellen Generation.
 */
export function buildManeuverOut(
  steps: NavRouteStep[],
  stepIdx: number,
  polyline: LatLon[],
  guidanceStale: boolean,
  opts: BuildManeuverOpts,
): { maneuver: NavManeuverOut | null; distToManeuverM: number; stepIdx: number } {
  if (guidanceStale || steps.length === 0) {
    return { maneuver: null, distToManeuverM: 0, stepIdx };
  }

  const staleGeneration =
    opts.routeGeneration > 0 &&
    opts.boundRouteGeneration > 0 &&
    opts.routeGeneration < opts.boundRouteGeneration;
  if (staleGeneration) {
    return { maneuver: null, distToManeuverM: 0, stepIdx };
  }

  const progress = opts.committedProgressM;
  const idx = advanceManeuverStepIdx(steps, stepIdx, polyline, progress);
  const active = steps[idx];
  if (!active) return { maneuver: null, distToManeuverM: 0, stepIdx: idx };

  let distToManeuverM = 0;
  if (isValid(active.lat, active.lon)) {
    const liveM = distanceAlongRouteFromProgressM(polyline, progress, {
      lat: active.lat,
      lon: active.lon,
    });
    distToManeuverM = liveM ?? 0;
  }

  const parts = splitNavStepParts(active);
  const kind = classifyManeuverKind(parts.maneuver || active.instruction);
  const next = steps[idx + 1];
  const nextParts = next ? splitNavStepParts(next) : null;
  const nextKind = next
    ? classifyManeuverKind(nextParts?.maneuver || next.instruction)
    : null;

  return {
    stepIdx: idx,
    distToManeuverM,
    maneuver: {
      stepIdx: idx,
      instruction: active.instruction,
      maneuver: parts.maneuver,
      roadName: parts.roadName,
      distanceM: distToManeuverM,
      kind,
      nextManeuver: nextParts?.maneuver ?? null,
      nextRoadName: nextParts?.roadName ?? null,
      nextKind,
    },
  };
}
