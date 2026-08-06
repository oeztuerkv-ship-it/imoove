import { isFarFutureReservation } from "./dispatchStatus";
import type { RideRequest } from "../domain/rideRequest";

/** Fahrer-Priorität: Trio A (manuell) oder Pool B (Standard). */
export type DispatchPriority = "A" | "B";

/**
 * Fahrt-Eskalation (Market):
 * trio_a (0–10s, nur A) → pool_1 (10–20s, alle B) → pool_2 (20–30s, alle B) → open (ab 30s, Markt).
 */
export type DispatchPhase = "trio_a" | "pool_1" | "pool_2" | "open";

const PHASE_ORDER: DispatchPhase[] = ["trio_a", "pool_1", "pool_2", "open"];

const OPEN_INSTANT_STATUSES = new Set<RideRequest["status"]>([
  "pending",
  "requested",
  "searching_driver",
  "offered",
]);

export function normalizeDispatchPriority(raw: unknown): DispatchPriority {
  const t = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (t === "A" || t === "B") return t;
  /** Legacy C und Ungültiges → B (Pool). */
  return "B";
}

export function normalizeDispatchPhase(raw: unknown): DispatchPhase {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (t === "trio_a" || t === "pool_1" || t === "pool_2" || t === "open") return t;
  /** Legacy: nur Tier ohne Phase — A ≈ trio, B ≈ open (bereits eskaliert). */
  const tier = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (tier === "B") return "open";
  return "trio_a";
}

/** Sichtbarkeits-Tier für die Phase (A = Trio, B = Pool). */
export function dispatchTierForPhase(phase: DispatchPhase): DispatchPriority {
  return phase === "trio_a" ? "A" : "B";
}

export function nextDispatchPhase(phase: DispatchPhase): DispatchPhase | null {
  const i = PHASE_ORDER.indexOf(phase);
  if (i < 0 || i >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[i + 1]!;
}

/** @deprecated Prefer nextDispatchPhase — retained for reject-streak A→B on drivers. */
export function nextDispatchTier(tier: DispatchPriority): DispatchPriority | null {
  if (tier === "A") return "B";
  return null;
}

export function driverMatchesDispatchTier(
  driverPriority: DispatchPriority,
  rideTier: DispatchPriority,
): boolean {
  return driverPriority === rideTier;
}

export function isOpenInstantRideForDispatch(ride: Pick<RideRequest, "status" | "driverId" | "scheduledAt">): boolean {
  if (ride.driverId) return false;
  if (isFarFutureReservation(ride.scheduledAt ?? null)) return false;
  return OPEN_INSTANT_STATUSES.has(ride.status);
}

/** Offene Vorbestellung am Markt (noch ohne Fahrer). */
export function isOpenReservationForDispatch(
  ride: Pick<RideRequest, "status" | "driverId" | "scheduledAt">,
): boolean {
  if (ride.driverId) return false;
  if (ride.status !== "scheduled") return false;
  const scheduledAt = ride.scheduledAt ?? null;
  if (!scheduledAt) return false;
  const scheduledMs = new Date(scheduledAt).getTime();
  if (!Number.isFinite(scheduledMs) || scheduledMs < Date.now()) return false;
  return true;
}

/** Sofort- oder Reservierungsangebot mit Phasen-Eskalation (nicht Funk). */
export function isDispatchTierManagedRide(
  ride: Pick<RideRequest, "status" | "driverId" | "scheduledAt" | "dispatchMode">,
): boolean {
  if ((ride.dispatchMode ?? "market") === "funk") return false;
  return isOpenInstantRideForDispatch(ride) || isOpenReservationForDispatch(ride);
}

export function getDispatchTierTimeoutSec(dispatchConfig?: Record<string, unknown>): number {
  const env = Number(process.env.ONRODA_DISPATCH_TIER_TIMEOUT_SEC);
  if (Number.isFinite(env) && env >= 5 && env <= 300) return Math.round(env);
  const cfg = Number(dispatchConfig?.premiumTierTimeoutSeconds);
  if (Number.isFinite(cfg) && cfg >= 5 && cfg <= 300) return Math.round(cfg);
  /** Default 10 s pro Phase (Trio A / Pool 1 / Pool 2). */
  return 10;
}

export function dispatchTierStartedMs(ride: Pick<RideRequest, "dispatchTierStartedAt" | "createdAt">): number {
  const started = ride.dispatchTierStartedAt ? new Date(ride.dispatchTierStartedAt).getTime() : NaN;
  if (Number.isFinite(started)) return started;
  const created = new Date(ride.createdAt).getTime();
  return Number.isFinite(created) ? created : Date.now();
}

export function dispatchTierElapsedSec(
  ride: Pick<RideRequest, "dispatchTierStartedAt" | "createdAt">,
  nowMs = Date.now(),
): number {
  return Math.max(0, (nowMs - dispatchTierStartedMs(ride)) / 1000);
}

export function resolveRideDispatchPhase(
  ride: Pick<RideRequest, "dispatchPhase" | "dispatchTier">,
): DispatchPhase {
  if (ride.dispatchPhase != null && String(ride.dispatchPhase).trim() !== "") {
    return normalizeDispatchPhase(ride.dispatchPhase);
  }
  return normalizeDispatchPriority(ride.dispatchTier ?? "A") === "B" ? "open" : "trio_a";
}

/**
 * Timeout-Advance für timed Phasen (trio_a / pool_1 / pool_2).
 * `open` eskaliert nicht weiter (Markt bis Ghost-Expiry).
 */
export function shouldAdvanceDispatchTierByTimeout(
  ride: RideRequest,
  timeoutSec: number,
  nowMs = Date.now(),
): boolean {
  if (!isDispatchTierManagedRide(ride)) return false;
  const phase = resolveRideDispatchPhase(ride);
  if (phase === "open") return false;
  return dispatchTierElapsedSec(ride, nowMs) >= timeoutSec;
}

/**
 * Sofortfahrt und Vorbestellung: Trio-A-Phase ab Buchung.
 */
export function initialDispatchTierFieldsForRide(
  _scheduledAt?: string | null,
): Pick<RideRequest, "dispatchTier" | "dispatchTierStartedAt" | "dispatchPhase"> {
  return {
    dispatchTier: "A",
    dispatchPhase: "trio_a",
    dispatchTierStartedAt: new Date().toISOString(),
  };
}
