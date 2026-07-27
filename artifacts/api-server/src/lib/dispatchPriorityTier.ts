import { isFarFutureReservation } from "./dispatchStatus";
import type { RideRequest } from "../domain/rideRequest";

export type DispatchPriority = "A" | "B";

const TIER_ORDER: DispatchPriority[] = ["A", "B"];

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
  /** Legacy C und Ungültiges → B (Standardstufe). */
  return "B";
}

export function nextDispatchTier(tier: DispatchPriority): DispatchPriority | null {
  const i = TIER_ORDER.indexOf(tier);
  if (i < 0 || i >= TIER_ORDER.length - 1) return null;
  return TIER_ORDER[i + 1]!;
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

/** Sofort- oder Reservierungsangebot mit A→B-Stufen. */
export function isDispatchTierManagedRide(
  ride: Pick<RideRequest, "status" | "driverId" | "scheduledAt">,
): boolean {
  return isOpenInstantRideForDispatch(ride) || isOpenReservationForDispatch(ride);
}

export function getDispatchTierTimeoutSec(dispatchConfig?: Record<string, unknown>): number {
  const env = Number(process.env.ONRODA_DISPATCH_TIER_TIMEOUT_SEC);
  if (Number.isFinite(env) && env >= 5 && env <= 300) return Math.round(env);
  const cfg = Number(dispatchConfig?.premiumTierTimeoutSeconds);
  if (Number.isFinite(cfg) && cfg >= 5 && cfg <= 300) return Math.round(cfg);
  return 60;
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

export function shouldAdvanceDispatchTierByTimeout(
  ride: RideRequest,
  timeoutSec: number,
  nowMs = Date.now(),
): boolean {
  if (!isDispatchTierManagedRide(ride)) return false;
  const tier = normalizeDispatchPriority(ride.dispatchTier ?? "A");
  if (tier === "B") return false;
  return dispatchTierElapsedSec(ride, nowMs) >= timeoutSec;
}

/**
 * Sofortfahrt und Vorbestellung: gleiche A→B-Uhr ab Buchung.
 * (`scheduledAt` bleibt in der Signatur für Aufrufer; Start ist immer sofort.)
 */
export function initialDispatchTierFieldsForRide(
  _scheduledAt?: string | null,
): Pick<RideRequest, "dispatchTier" | "dispatchTierStartedAt"> {
  return { dispatchTier: "A", dispatchTierStartedAt: new Date().toISOString() };
}
