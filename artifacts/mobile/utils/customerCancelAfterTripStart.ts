import { rideRequiresPassengerPinClient } from "@/utils/rideRequiresPassengerPin";
import type { RideRequest } from "@/context/RideRequestContext";

/** Nach Startcode / Fahrtstart: Kunde darf nicht mehr stornieren oder abbrechen. */

type CancelGateRide = Partial<
  Pick<
    RideRequest,
    | "status"
    | "passengerPinVerifiedAt"
    | "passengerPinVerified"
    | "passengerId"
    | "authorizationSource"
    | "accessCodeId"
    | "rideKind"
    | "payerKind"
    | "voucherCode"
    | "passengerPinRequired"
    | "dispatchMode"
  >
> & { createdByPanelUserId?: string | null };

/**
 * - Suche / Soft-Cancel-Markt: immer stornierbar.
 * - App-Direkt + PIN: nur nach Verify, solange zugewiesen.
 * - Sonstige: Sperre ab `in_progress` / `passenger_onboard`.
 */
export function isCustomerCancelBlockedAfterTripStart(ride: CancelGateRide): boolean {
  const s = String(ride.status ?? "").trim();
  if (
    s === "pending" ||
    s === "requested" ||
    s === "searching_driver" ||
    s === "offered" ||
    s === "draft" ||
    s === "scheduled"
  ) {
    return false;
  }

  if (ride.passengerPinVerified === true) return true;
  if (typeof ride.passengerPinVerifiedAt === "string" && ride.passengerPinVerifiedAt.trim()) {
    return true;
  }

  const pinRequired =
    typeof ride.passengerPinRequired === "boolean"
      ? ride.passengerPinRequired
      : ride.authorizationSource != null &&
          ride.rideKind != null &&
          ride.payerKind != null &&
          rideRequiresPassengerPinClient({
            passengerId: ride.passengerId,
            authorizationSource: ride.authorizationSource,
            accessCodeId: ride.accessCodeId ?? null,
            rideKind: ride.rideKind,
            payerKind: ride.payerKind,
            voucherCode: ride.voucherCode ?? null,
            passengerPinRequired: ride.passengerPinRequired,
            dispatchMode: ride.dispatchMode ?? "market",
            createdByPanelUserId: ride.createdByPanelUserId,
          });

  // PIN-pflichtig: ohne Verify immer noch stornierbar (Anfahrt / Ankunft / in_progress-Race).
  if (pinRequired) return false;

  return s === "in_progress" || s === "passenger_onboard";
}

export const CUSTOMER_CANCEL_BLOCKED_TRIP_STARTED = "customer_cancel_blocked_trip_started";
