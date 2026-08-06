import type { PayerKind, RideRequest } from "@/context/RideRequestContext";

/**
 * Betriebslogik Fahrt (Cloud-Flowchart): Status → Kunden-UI-Phase.
 * Taxameter-Anzeige während aktiver Fahrt (keine Euro-Schätzung für Kunden).
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

export function isStripeWalletRidePayment(paymentMethod?: string | null): boolean {
  const pm = (paymentMethod ?? "").toLowerCase();
  return (
    pm.includes("kredit") ||
    pm.includes("card") ||
    pm.includes("apple") ||
    pm.includes("google pay") ||
    pm.includes("google_pay")
  );
}

/** Karte/Wallet: Taxameter-Hinweis während aktiver Fahrt (Abbuchung erst nach Fahrtende). */
export function customerShowsPendingChargeEstimate(
  status: string,
  req: Pick<RideRequest, "rideKind" | "payerKind" | "paymentMethod">,
): boolean {
  if (isInsuranceOrKkRide(req)) return false;
  if (!isStripeWalletRidePayment(req.paymentMethod)) return false;
  if (
    status === "completed" ||
    status === "cancelled" ||
    status === "cancelled_by_customer" ||
    status === "cancelled_by_driver" ||
    status === "cancelled_by_system" ||
    status === "expired" ||
    status === "rejected"
  ) {
    return false;
  }
  return isCustomerDriverAssignedStatus(status) || status === "in_progress" || status === "requested";
}

/** Kunde sieht Taxameter-Hinweis nur während echter Fahrt zum Ziel (`in_progress`) — Bar o. ä. */
export function customerShowsTripEstimate(status: string, req: Pick<RideRequest, "rideKind" | "payerKind" | "paymentMethod">): boolean {
  if (status !== "in_progress") return false;
  return !isInsuranceOrKkRide(req);
}

export function customerLivePhaseFromRideStatus(
  status: string,
  opts: {
    scheduledAt: string | Date | null | undefined;
    withinPickupHour: boolean;
    /** App-Direkt + PIN: ohne Verify kein „driving“ / „Fahrt gestartet“ (auch bei in_progress-Race). */
    passengerPinRequired?: boolean;
    passengerPinVerified?: boolean;
  },
): CustomerLiveRidePhase | null {
  if (status === "in_progress") {
    if (opts.passengerPinRequired === true && opts.passengerPinVerified !== true) {
      return "arrived";
    }
    return "driving";
  }
  if (status === "passenger_onboard" || status === "arrived" || status === "driver_waiting") return "arrived";
  if (
    opts.scheduledAt &&
    opts.withinPickupHour &&
    (status === "accepted" ||
      status === "driver_arriving" ||
      status === "ready_for_dispatch" ||
      status === "scheduled_assigned")
  ) {
    return "preparing";
  }
  if (status === "accepted" || status === "driver_arriving" || status === "ready_for_dispatch") return "accepted";
  return null;
}

/** Fahrer zugewiesen / Live-Fahrt — nicht „Suche Fahrer“. */
export function isCustomerDriverAssignedStatus(status: string): boolean {
  return (
    status === "ready_for_dispatch" ||
    status === "accepted" ||
    status === "driver_arriving" ||
    status === "driver_waiting" ||
    status === "passenger_onboard" ||
    status === "arrived" ||
    status === "in_progress"
  );
}
