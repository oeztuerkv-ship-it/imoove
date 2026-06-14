import type Stripe from "stripe";
import { findRide, updateRide } from "../db/ridesData";
import { normalizeRidePaymentStatus } from "./ridePaymentStatus";

export type ApplyStripePaymentIntentResult =
  | { applied: true; rideId: string; paymentStatus: "paid" | "failed" }
  | { applied: false; rideId?: string; reason: string };

/** Stripe PI → rides.payment_status (Webhook + confirm-ride). */
export async function applyStripePaymentIntentToRide(
  paymentIntent: Stripe.PaymentIntent,
): Promise<ApplyStripePaymentIntentResult> {
  const rideId = String(paymentIntent.metadata?.ride_id ?? "").trim();
  if (!rideId) {
    return { applied: false, reason: "missing_ride_id_metadata" };
  }

  const ride = await findRide(rideId);
  if (!ride) {
    return { applied: false, rideId, reason: "ride_not_found" };
  }

  if (normalizeRidePaymentStatus(ride.paymentStatus) === "refunded") {
    return { applied: false, rideId, reason: "ride_already_refunded" };
  }

  const metaPassenger = String(paymentIntent.metadata?.passenger_id ?? "").trim();
  const ridePassenger = (ride.passengerId ?? "").trim();
  if (metaPassenger && ridePassenger && metaPassenger !== ridePassenger) {
    return { applied: false, rideId, reason: "passenger_metadata_mismatch" };
  }

  if (paymentIntent.status === "succeeded") {
    if (normalizeRidePaymentStatus(ride.paymentStatus) === "paid" && ride.stripePaymentIntentId === paymentIntent.id) {
      return { applied: true, rideId, paymentStatus: "paid" };
    }
    await updateRide(rideId, {
      paymentStatus: "paid",
      stripePaymentIntentId: paymentIntent.id,
    });
    return { applied: true, rideId, paymentStatus: "paid" };
  }

  if (
    paymentIntent.status === "canceled" ||
    paymentIntent.status === "requires_payment_method"
  ) {
    if (normalizeRidePaymentStatus(ride.paymentStatus) !== "paid") {
      await updateRide(rideId, { paymentStatus: "failed" });
      return { applied: true, rideId, paymentStatus: "failed" };
    }
    return { applied: false, rideId, reason: "ride_already_paid" };
  }

  return { applied: false, rideId, reason: `unhandled_pi_status_${paymentIntent.status}` };
}
