/**
 * Markt-GPS für Dispatch-Radius: wann ein Sprung akzeptiert wird.
 * Verhindert, dass ein alter last_market_* nach Ortswechsel (>5 km) ewig stecken bleibt.
 */
import { haversineDistanceKm } from "./serviceRegionMatch";
import { GPS_OUTLIER_JUMP_KM, isGpsOutlierJump } from "./gpsOutlierFilter";

/** Nach so vielen ms ohne echten Location-Write gilt der Fix als veraltet → Sprung erlaubt. */
export const MARKET_LOCATION_MAX_AGE_MS = 3 * 60 * 1000;

export type MarketLocationJumpDecision =
  | { accept: true; reason: "no_previous" | "within_jump" | "stale_previous" }
  | { accept: false; reason: "outlier_jump"; distanceKm: number };

export function decideMarketLocationUpdate(opts: {
  prevLat: number | null | undefined;
  prevLon: number | null | undefined;
  nextLat: number;
  nextLon: number;
  /** Zeitpunkt des letzten erfolgreichen last_market_*-Writes; null = unbekannt/leer. */
  lastMarketAt: Date | null | undefined;
  nowMs?: number;
  maxAgeMs?: number;
  maxJumpKm?: number;
}): MarketLocationJumpDecision {
  const prevLat = opts.prevLat;
  const prevLon = opts.prevLon;
  if (
    prevLat == null ||
    prevLon == null ||
    !Number.isFinite(prevLat) ||
    !Number.isFinite(prevLon)
  ) {
    return { accept: true, reason: "no_previous" };
  }

  const nowMs = opts.nowMs ?? Date.now();
  const maxAgeMs = opts.maxAgeMs ?? MARKET_LOCATION_MAX_AGE_MS;
  const lastAt =
    opts.lastMarketAt instanceof Date && !Number.isNaN(opts.lastMarketAt.getTime())
      ? opts.lastMarketAt.getTime()
      : null;
  const stale = lastAt == null || nowMs - lastAt >= maxAgeMs;
  if (stale) {
    return { accept: true, reason: "stale_previous" };
  }

  const maxJumpKm = opts.maxJumpKm ?? GPS_OUTLIER_JUMP_KM;
  if (!isGpsOutlierJump(prevLat, prevLon, opts.nextLat, opts.nextLon, maxJumpKm)) {
    return { accept: true, reason: "within_jump" };
  }

  const distanceKm = haversineDistanceKm(prevLat, prevLon, opts.nextLat, opts.nextLon);
  return {
    accept: false,
    reason: "outlier_jump",
    distanceKm: Math.round(distanceKm * 100) / 100,
  };
}
