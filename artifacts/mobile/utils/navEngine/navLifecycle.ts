/**
 * P4: Session-Guard, GPS-Lifecycle (ACTIVE/STALE/LOST), Watch-Idempotenz.
 * Keine Heading-/Off-Route-Schwellen.
 */

import type { NavGpsStateKind } from "./types";

/** Ohne neuen Fix: GPS gilt als unfrisch. */
export const NAV_GPS_STALE_AFTER_MS = 3_000;
/** Ohne neuen Fix: GPS gilt als verloren. */
export const NAV_GPS_LOST_AFTER_MS = 8_000;

let sessionSeq = 0;

export function nextNavigationSessionId(): number {
  sessionSeq += 1;
  return sessionSeq;
}

export type NavAsyncGuard = {
  mounted: boolean;
  sessionId: number;
  routeGeneration?: number;
};

export function acceptNavAsync(
  live: NavAsyncGuard,
  incoming: { sessionId: number; routeGeneration?: number },
): boolean {
  if (!live.mounted) return false;
  if (incoming.sessionId !== live.sessionId) return false;
  if (
    incoming.routeGeneration != null &&
    live.routeGeneration != null &&
    incoming.routeGeneration !== live.routeGeneration
  ) {
    return false;
  }
  return true;
}

export function classifyGpsLifecycle(args: {
  lastFixAt: number | null;
  nowMs: number;
  resyncing: boolean;
}): NavGpsStateKind {
  if (args.resyncing) return "STALE";
  if (args.lastFixAt == null) return "LOST";
  const age = args.nowMs - args.lastFixAt;
  if (age >= NAV_GPS_LOST_AFTER_MS) return "LOST";
  if (age >= NAV_GPS_STALE_AFTER_MS) return "STALE";
  return "ACTIVE";
}

/** Off-Route / Reroute nur bei ACTIVE und nicht während Resume-Resync. */
export function shouldEvaluateOffRoute(gpsState: NavGpsStateKind, resyncing: boolean): boolean {
  return !resyncing && gpsState === "ACTIVE";
}

export type LocationWatchGuard = {
  start: () => number;
  stop: () => void;
  isLive: (epoch: number) => boolean;
};

export function createLocationWatchGuard(): LocationWatchGuard {
  let epoch = 0;
  let stopped = true;
  return {
    start: () => {
      epoch += 1;
      stopped = false;
      return epoch;
    },
    stop: () => {
      stopped = true;
    },
    isLive: (id: number) => !stopped && id === epoch,
  };
}
