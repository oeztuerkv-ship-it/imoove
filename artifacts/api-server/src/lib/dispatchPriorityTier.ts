import { isFarFutureReservation } from "./dispatchStatus";
import type { RideRequest } from "../domain/rideRequest";

export type DispatchPriority = "A" | "B" | "C";

const TIER_ORDER: DispatchPriority[] = ["A", "B", "C"];

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
  if (t === "A" || t === "B" || t === "C") return t;
  return "C";
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

export function getDispatchTierTimeoutSec(dispatchConfig?: Record<string, unknown>): number {
  const env = Number(process.env.ONRODA_DISPATCH_TIER_TIMEOUT_SEC);
  if (Number.isFinite(env) && env >= 5 && env <= 300) return Math.round(env);
  const cfg = Number(dispatchConfig?.premiumTierTimeoutSeconds);
  if (Number.isFinite(cfg) && cfg >= 5 && cfg <= 300) return Math.round(cfg);
  return 30;
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
  if (!isOpenInstantRideForDispatch(ride)) return false;
  const tier = normalizeDispatchPriority(ride.dispatchTier ?? "A");
  if (tier === "C") return false;
  return dispatchTierElapsedSec(ride, nowMs) >= timeoutSec;
}

export function initialDispatchTierFieldsForRide(
  scheduledAt: string | null | undefined,
): Pick<RideRequest, "dispatchTier" | "dispatchTierStartedAt"> {
  if (isFarFutureReservation(scheduledAt ?? null)) {
    return { dispatchTier: "A", dispatchTierStartedAt: null };
  }
  return { dispatchTier: "A", dispatchTierStartedAt: new Date().toISOString() };
}

/** E-Mail gehört zu Plattform-Admin → automatisch Dispatch-Priorität A. */
export function emailQualifiesForAutoDispatchPriorityA(email: string): boolean {
  const em = email.trim().toLowerCase();
  if (!em) return false;
  if (em.includes("vedat")) return true;
  const listed = (process.env.ONRODA_DISPATCH_PRIORITY_A_EMAILS ?? "")
    .split(/[,;]/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return listed.includes(em);
}
