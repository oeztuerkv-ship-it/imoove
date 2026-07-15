import type { RideRequest } from "@/context/RideRequestContext";

/** Spiegelt Server `rideRequiresPassengerPin` — nur echte App-Direktfahrten. */
export function rideRequiresPassengerPinClient(
  ride: Pick<
    RideRequest,
    | "passengerId"
    | "authorizationSource"
    | "accessCodeId"
    | "rideKind"
    | "payerKind"
    | "voucherCode"
    | "passengerPinRequired"
  > & { createdByPanelUserId?: string | null },
): boolean {
  if (typeof ride.passengerPinRequired === "boolean") return ride.passengerPinRequired;
  const pid = (ride.passengerId ?? "").trim();
  if (!pid) return false;
  if ((ride.createdByPanelUserId ?? "").trim()) return false;
  if ((ride.accessCodeId ?? "").trim()) return false;
  if ((ride.voucherCode ?? "").trim()) return false;
  if (ride.authorizationSource !== "passenger_direct") return false;
  if (ride.rideKind !== "standard") return false;
  if (ride.payerKind !== "passenger") return false;
  return true;
}
