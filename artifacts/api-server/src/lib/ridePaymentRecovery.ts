import type { RideRequest } from "../domain/rideRequest";
import { findCustomerAccountById } from "../db/customerAccountsData";
import { insertSupplementalRideEvent } from "../db/ridesData";
import {
  captureRideStripePaymentIntent,
} from "./stripeRideAuthorization";
import { isStripeWalletPaymentMethod } from "./ridePaymentMethod";

/** Cron: fällige Retries für fehlgeschlagene Captures. */
export async function retryDueFailedPaymentCaptures(now: Date = new Date()): Promise<string[]> {
  const { listRidesDueForPaymentCaptureRetry } = await import("../db/ridesData.js");
  const due = await listRidesDueForPaymentCaptureRetry(now);
  const retried: string[] = [];

  for (const ride of due) {
    const rideId = ride.id.trim();
    if (!rideId) continue;
    const outcome = await captureRideStripePaymentIntent(ride);
    if (outcome.ok && !outcome.skipped) {
      await insertSupplementalRideEvent(rideId, {
        eventType: "payment_capture_retry_succeeded",
        fromStatus: ride.status,
        toStatus: ride.status,
        actorType: "system",
        actorId: null,
        payload: { capturedAmountCents: outcome.capturedAmountCents },
      });
      retried.push(rideId);
    }
  }

  return retried;
}

/** Kunde hat Karte aktualisiert — manueller Retry einer offenen Fahrt. */
export async function retryPassengerFailedRidePayment(
  rideId: string,
  passengerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { findRideForPassenger } = await import("../db/ridesData.js");
  const ride = await findRideForPassenger(rideId.trim(), passengerId.trim(), {
    skipLifecycleExpiry: true,
  });
  if (!ride) return { ok: false, error: "not_found" };
  if (ride.status !== "completed") return { ok: false, error: "ride_not_completed" };
  if (ride.paymentStatus !== "failed") return { ok: false, error: "payment_not_failed" };
  if (!isStripeWalletPaymentMethod(ride.paymentMethod)) {
    return { ok: false, error: "payment_method_not_card" };
  }

  const outcome = await captureRideStripePaymentIntent(ride);
  if (outcome.ok && !outcome.skipped) {
    return { ok: true };
  }
  if (outcome.ok && outcome.skipped) {
    return { ok: false, error: "capture_skipped" };
  }
  return { ok: false, error: outcome.error };
}

export async function passengerEmailForAdmin(ride: RideRequest): Promise<string | null> {
  const pid = (ride.passengerId ?? "").trim();
  if (!pid) return null;
  const account = await findCustomerAccountById(pid);
  const email = account?.email?.trim();
  return email && email.includes("@") ? email : null;
}
