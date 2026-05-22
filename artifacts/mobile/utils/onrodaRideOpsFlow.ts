import type { PayerKind, RideRequest } from "@/context/RideRequestContext";

/**
 * Betriebslogik Fahrt (Cloud-Flowchart): Status → Kunden-UI-Phase.
 * Schätzpreis nur bei `in_progress` und ohne Krankenkassen-Fahrt.
 */
export type CustomerLiveRidePhase =
  | "searching"
  | "reserved"
  | "reservation_unfulfilled"
  | "accepted"
  | "preparing"
  | "arrived"
  | "driving"
  | "completed";

export function isInsuranceOrKkRide(req: {
  rideKind?: string;
  payerKind?: PayerKind;
  paymentMethod?: string;
}): boolean {
  if (req.rideKind === "medical") return true;
  if (req.payerKind === "insurance" || req.payerKind === "voucher") return true;
  const pm = (req.paymentMethod ?? "").toLowerCase();
  return pm.includes("krankenkasse") || pm.includes("transportschein");
}

/** Kunde sieht Schätzpreis nur während echter Fahrt zum Ziel (`in_progress`). */
export function customerShowsTripEstimate(status: string, req: Pick<RideRequest, "rideKind" | "payerKind" | "paymentMethod">): boolean {
  if (status !== "in_progress") return false;
  return !isInsuranceOrKkRide(req);
}

export function customerLivePhaseFromRideStatus(
  status: string,
  opts: { scheduledAt: string | Date | null | undefined; withinPickupHour: boolean },
): CustomerLiveRidePhase | null {
  if (status === "in_progress") return "driving";
  if (status === "passenger_onboard" || status === "arrived" || status === "driver_waiting") return "arrived";
  if (opts.scheduledAt && opts.withinPickupHour) return "preparing";
  if (status === "accepted" || status === "driver_arriving" || status === "ready_for_dispatch") return "accepted";
  return null;
}
