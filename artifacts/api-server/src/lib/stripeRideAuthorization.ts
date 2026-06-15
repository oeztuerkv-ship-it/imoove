import type Stripe from "stripe";
import type { RideRequest } from "../domain/rideRequest";
import { findRide, updateRide } from "../db/ridesData";
import { logger } from "./logger";
import { normalizeRidePaymentStatus } from "./ridePaymentStatus";
import { getStripeClient } from "./stripeClient";
import { resolveStripeConnectPaymentParams } from "./stripeConnect";

export const STRIPE_AUTHORIZATION_BUFFER_RATIO = 0.3;

function roundMoneyEur(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Schätzpreis + 30 % Puffer, mindestens Schätzpreis (EUR). */
export function stripeAuthorizationAmountEurFromEstimate(estimateEur: number): number {
  const estimate = roundMoneyEur(Math.max(0, estimateEur));
  if (estimate <= 0) return 0;
  const withBuffer = roundMoneyEur(estimate * (1 + STRIPE_AUTHORIZATION_BUFFER_RATIO));
  return Math.max(estimate, withBuffer);
}

export function stripeAuthorizationAmountCentsFromEstimate(estimateEur: number): number {
  const eur = stripeAuthorizationAmountEurFromEstimate(estimateEur);
  return Math.round(eur * 100);
}

export function isStripeWalletPaymentMethod(paymentMethod: string | null | undefined): boolean {
  const pm = (paymentMethod ?? "").trim().toLowerCase();
  return pm === "card" || pm.includes("apple") || pm.includes("google");
}

export function isStripePaymentIntentAuthorized(status: Stripe.PaymentIntent.Status): boolean {
  return status === "requires_capture";
}

export function isStripePaymentIntentCaptured(status: Stripe.PaymentIntent.Status): boolean {
  return status === "succeeded";
}

export type CaptureRideStripePaymentResult =
  | { ok: true; capturedAmountCents: number; cappedToAuthorization: boolean; skipped?: boolean }
  | { ok: false; error: string };

/** Nach Fahrtende: autorisierten Betrag mit Taxameter-Endpreis belasten. */
export async function captureRideStripePaymentIntent(
  ride: RideRequest,
): Promise<CaptureRideStripePaymentResult> {
  if (!isStripeWalletPaymentMethod(ride.paymentMethod)) {
    return { ok: true, capturedAmountCents: 0, cappedToAuthorization: false, skipped: true };
  }

  const stripe = getStripeClient();
  if (!stripe) return { ok: false, error: "stripe_not_configured" };

  const rideId = ride.id.trim();
  const piId = (ride.stripePaymentIntentId ?? "").trim();
  if (!piId) {
    return { ok: true, capturedAmountCents: 0, cappedToAuthorization: false, skipped: true };
  }

  const paymentStatus = normalizeRidePaymentStatus(ride.paymentStatus);
  if (paymentStatus === "paid") {
    return { ok: true, capturedAmountCents: 0, cappedToAuthorization: false };
  }
  if (paymentStatus !== "authorized" && paymentStatus !== "pending") {
    return { ok: false, error: `ride_payment_status_${paymentStatus}` };
  }

  const finalFare = Number(ride.finalFare);
  if (!Number.isFinite(finalFare) || finalFare <= 0) {
    return { ok: false, error: "final_fare_required_for_capture" };
  }

  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(piId);
  } catch {
    return { ok: false, error: "invalid_payment_intent" };
  }

  if (isStripePaymentIntentCaptured(paymentIntent.status)) {
    await updateRide(rideId, { paymentStatus: "paid", stripePaymentIntentId: paymentIntent.id });
    return { ok: true, capturedAmountCents: paymentIntent.amount_received ?? paymentIntent.amount, cappedToAuthorization: false };
  }

  if (!isStripePaymentIntentAuthorized(paymentIntent.status)) {
    return { ok: false, error: `payment_intent_status_${paymentIntent.status}` };
  }

  const finalCents = Math.round(finalFare * 100);
  if (finalCents < 50) return { ok: false, error: "capture_amount_below_minimum" };

  const authorizedCents = paymentIntent.amount;
  const captureCents = Math.min(finalCents, authorizedCents);
  const cappedToAuthorization = finalCents > authorizedCents;
  if (cappedToAuthorization) {
    logger.warn(
      { rideId, finalCents, authorizedCents, paymentIntentId: piId },
      "[Stripe] capture capped at authorized amount",
    );
  }

  const connectParams = await resolveStripeConnectPaymentParams(ride.companyId, captureCents);

  try {
    const captured = await stripe.paymentIntents.capture(piId, {
      amount_to_capture: captureCents,
      ...(connectParams ? { application_fee_amount: connectParams.application_fee_amount } : {}),
    });
    if (!isStripePaymentIntentCaptured(captured.status)) {
      return { ok: false, error: `capture_status_${captured.status}` };
    }
    await updateRide(rideId, { paymentStatus: "paid", stripePaymentIntentId: captured.id });
    return { ok: true, capturedAmountCents: captureCents, cappedToAuthorization };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, rideId, paymentIntentId: piId }, "[Stripe] capture failed");
    return { ok: false, error: message || "stripe_capture_failed" };
  }
}

export type CancelRideStripePaymentResult =
  | { ok: true; canceled: boolean }
  | { ok: false; error: string };

const RELEASE_AUTH_STATUSES = new Set<RideRequest["status"]>([
  "cancelled_by_customer",
  "cancelled_by_driver",
  "cancelled_by_system",
  "cancelled",
  "expired",
  "rejected",
]);

export function shouldReleaseStripeAuthorizationOnRideStatus(status: RideRequest["status"]): boolean {
  return RELEASE_AUTH_STATUSES.has(status);
}

/** Storno/Ablauf: offene Autorisierung freigeben (kein Capture). */
export async function cancelRideStripePaymentAuthorization(
  ride: RideRequest,
): Promise<CancelRideStripePaymentResult> {
  if (!isStripeWalletPaymentMethod(ride.paymentMethod)) {
    return { ok: true, canceled: false };
  }

  const stripe = getStripeClient();
  if (!stripe) return { ok: false, error: "stripe_not_configured" };

  const rideId = ride.id.trim();
  const piId = (ride.stripePaymentIntentId ?? "").trim();
  if (!piId) return { ok: true, canceled: false };

  const paymentStatus = normalizeRidePaymentStatus(ride.paymentStatus);
  if (paymentStatus === "paid" || paymentStatus === "refunded") {
    return { ok: true, canceled: false };
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(piId);
    if (paymentIntent.status === "canceled") {
      if (paymentStatus === "authorized") {
        await updateRide(rideId, { paymentStatus: "pending" });
      }
      return { ok: true, canceled: true };
    }

    if (
      paymentIntent.status === "requires_capture" ||
      paymentIntent.status === "requires_confirmation" ||
      paymentIntent.status === "requires_action" ||
      paymentIntent.status === "requires_payment_method"
    ) {
      await stripe.paymentIntents.cancel(piId);
      await updateRide(rideId, { paymentStatus: "pending" });
      return { ok: true, canceled: true };
    }

    return { ok: true, canceled: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, rideId, paymentIntentId: piId }, "[Stripe] cancel authorization failed");
    return { ok: false, error: message || "stripe_cancel_failed" };
  }
}

/** Capture/Cancel-Helfer mit frischem Ride-Stand aus der DB. */
export async function captureRideStripePaymentById(rideId: string): Promise<CaptureRideStripePaymentResult> {
  const ride = await findRide(rideId.trim());
  if (!ride) return { ok: false, error: "ride_not_found" };
  return captureRideStripePaymentIntent(ride);
}
