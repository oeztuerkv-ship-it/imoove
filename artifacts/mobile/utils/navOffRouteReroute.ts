/**
 * Off-Route-Bestätigung + Reroute-Cooldown (Fahrer-Navi MVP).
 * Distanz kommt von `distanceToPolylineM`.
 */

/** Querabstand über dem die Position als abseits gilt. */
export const NAV_OFF_ROUTE_THRESHOLD_M = 25;

/** Mind. so viele aufeinanderfolgende Off-Fixes. */
export const NAV_OFF_ROUTE_CONFIRM_FIXES = 2;

/** Oder so lange durchgehend abseits (ms). */
export const NAV_OFF_ROUTE_CONFIRM_MS = 2000;

/** Mindestabstand zwischen Reroute-Versuchen (auch nach Fehler). */
export const NAV_REROUTE_COOLDOWN_MS = 7_000;

export type OffRouteTrackerState = {
  consecutiveOffFixes: number;
  offSinceMs: number | null;
};

export function createOffRouteTrackerState(): OffRouteTrackerState {
  return { consecutiveOffFixes: 0, offSinceMs: null };
}

/**
 * Ein GPS-Sample: on-route → Tracker reset; off-route → zählen.
 * `confirmedOffRoute` nur bei Bestätigung (Fixes ODER Dauer).
 */
export function noteOffRouteSample(
  state: OffRouteTrackerState,
  distanceToRouteM: number | null,
  nowMs: number,
  thresholdM: number = NAV_OFF_ROUTE_THRESHOLD_M,
): { state: OffRouteTrackerState; confirmedOffRoute: boolean } {
  if (distanceToRouteM == null || !Number.isFinite(distanceToRouteM) || distanceToRouteM <= thresholdM) {
    return { state: createOffRouteTrackerState(), confirmedOffRoute: false };
  }

  const consecutiveOffFixes = state.consecutiveOffFixes + 1;
  const offSinceMs = state.offSinceMs ?? nowMs;
  const next: OffRouteTrackerState = { consecutiveOffFixes, offSinceMs };
  const byFixes = consecutiveOffFixes >= NAV_OFF_ROUTE_CONFIRM_FIXES;
  const byTime = nowMs - offSinceMs >= NAV_OFF_ROUTE_CONFIRM_MS;
  return { state: next, confirmedOffRoute: byFixes || byTime };
}

export function canStartReroute(opts: {
  inFlight: boolean;
  lastRerouteAtMs: number | null;
  nowMs: number;
  cooldownMs?: number;
}): boolean {
  if (opts.inFlight) return false;
  const cooldown = opts.cooldownMs ?? NAV_REROUTE_COOLDOWN_MS;
  if (opts.lastRerouteAtMs != null && opts.nowMs - opts.lastRerouteAtMs < cooldown) {
    return false;
  }
  return true;
}
