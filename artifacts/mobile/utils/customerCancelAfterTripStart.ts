/** Nach Startcode / Fahrtstart: Kunde darf nicht mehr stornieren oder abbrechen. */

export function isCustomerCancelBlockedAfterTripStart(ride: {
  status?: string | null;
  passengerPinVerifiedAt?: string | null;
  passengerPinVerified?: boolean | null;
}): boolean {
  if (ride.passengerPinVerified === true) return true;
  if (ride.passengerPinVerifiedAt) return true;
  const s = String(ride.status ?? "").trim();
  return s === "in_progress" || s === "passenger_onboard";
}

export const CUSTOMER_CANCEL_BLOCKED_TRIP_STARTED = "customer_cancel_blocked_trip_started";
