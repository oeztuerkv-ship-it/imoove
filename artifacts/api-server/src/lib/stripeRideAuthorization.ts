import type Stripe from "stripe";
import type { RideRequest } from "../domain/rideRequest";
import { findRide, updateRide } from "../db/ridesData";
import { logger } from "./logger";
import { normalizeRidePaymentStatus } from "./ridePaymentStatus";
import { getStripeClient } from "./stripeClient";
import { markRidePaymentCaptureFailed, markRidePaymentCaptureSucceeded } from "./ridePaymentCaptureState";
import { persistStripeFeeForRidePaymentIntentId } from "./stripeRideFinancialFee";
import { isStripeWalletPaymentMethod } from "./ridePaymentMethod";
import { resolveStripeConnectPaymentParams } from "./stripeConnect";
import {
  chargePassengerRideFinalFare,
  resolvePassengerSavedCardPaymentMethod,
} from "./stripePassengerCustomer";

/** @deprecated Nur Alt-Buchungen mit 1-€-Prüfung — neue Buchungen nutzen SetupIntent ohne Abbuchung. */
export const STRIPE_CARD_VERIFY_AMOUNT_EUR = 1;

/** Legacy: früher 30 % Puffer — nur noch für Alt-PIs mit hoher Autorisierung. */
export const STRIPE_AUTHORIZATION_BUFFER_RATIO = 0.3;

const LEGACY_VERIFY_MAX_CENTS = 150;

function roundMoneyEur(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Betrag für Kartenprüfung beim Buchen (1 €). */
export function stripeCardVerificationAmountEur(): number {
  return STRIPE_CARD_VERIFY_AMOUNT_EUR;
}

export function stripeCardVerificationAmountCents(): number {
  return Math.round(STRIPE_CARD_VERIFY_AMOUNT_EUR * 100);
}

/** @deprecated Nur Alt-PIs — neue Buchungen nutzen {@link stripeCardVerificationAmountEur}. */
export function stripeAuthorizationAmountEurFromEstimate(estimateEur: number): number {
  const estimate = roundMoneyEur(Math.max(0, estimateEur));
  if (estimate <= 0) return 0;
  const withBuffer = roundMoneyEur(estimate * (1 + STRIPE_AUTHORIZATION_BUFFER_RATIO));
  return Math.max(estimate, withBuffer);
}

export { isStripeWalletPaymentMethod } from "./ridePaymentMethod";

export function isStripePaymentIntentAuthorized(status: Stripe.PaymentIntent.Status): boolean {
  return status === "requires_capture";
}

export function isStripePaymentIntentCaptured(status: Stripe.PaymentIntent.Status): boolean {
  return status === "succeeded";
}

function paymentMethodIdFromIntent(paymentIntent: Stripe.PaymentIntent): string | null {
  const pm = paymentIntent.payment_method;
  if (typeof pm === "string" && pm.trim()) return pm.trim();
  if (pm && typeof pm === "object" && typeof pm.id === "string" && pm.id.trim()) return pm.id.trim();
  return null;
}

function customerIdFromIntent(paymentIntent: Stripe.PaymentIntent): string | null {
  const customer = paymentIntent.customer;
  if (typeof customer === "string" && customer.trim()) return customer.trim();
  if (customer && typeof customer === "object" && typeof customer.id === "string" && customer.id.trim()) {
    return customer.id.trim();
  }
  return null;
}

export type CaptureRideStripePaymentResult =
  | { ok: true; capturedAmountCents: number; cappedToAuthorization: boolean; skipped?: boolean }
  | { ok: false; error: string };

async function captureLegacyBufferedAuthorization(
  ride: RideRequest,
  paymentIntent: Stripe.PaymentIntent,
  piId: string,
  finalCents: number,
): Promise<CaptureRideStripePaymentResult> {
  const authorizedCents = paymentIntent.amount;
  const captureCents = Math.min(finalCents, authorizedCents);
  const cappedToAuthorization = finalCents > authorizedCents;
  if (cappedToAuthorization) {
    logger.warn(
      { rideId: ride.id, finalCents, authorizedCents, paymentIntentId: piId },
      "[Stripe] legacy capture capped at authorized amount",
    );
  }
  const connectParams = await resolveStripeConnectPaymentParams(ride.companyId, captureCents);
  const stripe = getStripeClient();
  if (!stripe) return { ok: false, error: "stripe_not_configured" };
  try {
    const captured = await stripe.paymentIntents.capture(piId, {
      amount_to_capture: captureCents,
      ...(connectParams ? { application_fee_amount: connectParams.application_fee_amount } : {}),
    });
    if (!isStripePaymentIntentCaptured(captured.status)) {
      const err = `capture_status_${captured.status}`;
      await markRidePaymentCaptureFailed(ride, err, piId);
      return { ok: false, error: err };
    }
    await markRidePaymentCaptureSucceeded(ride.id.trim(), captured.id);
    void persistStripeFeeForRidePaymentIntentId(ride.id.trim(), captured.id);
    return { ok: true, capturedAmountCents: captureCents, cappedToAuthorization };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, rideId: ride.id, paymentIntentId: piId }, "[Stripe] legacy capture failed");
    const errText = message || "stripe_capture_failed";
    await markRidePaymentCaptureFailed(ride, errText, piId);
    return { ok: false, error: errText };
  }
}

async function failCompletedRideCapture(
  ride: RideRequest,
  error: string,
  stripePaymentIntentId?: string | null,
): Promise<CaptureRideStripePaymentResult> {
  if (ride.status === "completed") {
    await markRidePaymentCaptureFailed(ride, error, stripePaymentIntentId);
  }
  return { ok: false, error };
}

/** Nach Fahrtende: Endpreis von hinterlegter Karte abbuchen (kein Buchungs-Hold bei neuem Flow). */
export async function captureRideStripePaymentIntent(
  ride: RideRequest,
): Promise<CaptureRideStripePaymentResult> {
  if (!isStripeWalletPaymentMethod(ride.paymentMethod)) {
    return { ok: true, capturedAmountCents: 0, cappedToAuthorization: false, skipped: true };
  }

  const stripe = getStripeClient();
  if (!stripe) return { ok: false, error: "stripe_not_configured" };

  const rideId = ride.id.trim();
  let piId = (ride.stripePaymentIntentId ?? "").trim();

  const paymentStatus = normalizeRidePaymentStatus(ride.paymentStatus);
  if (paymentStatus === "paid") {
    return { ok: true, capturedAmountCents: 0, cappedToAuthorization: false };
  }

  const isPaymentRetry = paymentStatus === "failed" && ride.status === "completed";
  if (!isPaymentRetry && paymentStatus !== "authorized" && paymentStatus !== "pending") {
    return { ok: false, error: `ride_payment_status_${paymentStatus}` };
  }
  if (isPaymentRetry) {
    piId = "";
  }

  const finalFare = Number(ride.finalFare);
  if (!Number.isFinite(finalFare) || finalFare <= 0) {
    return failCompletedRideCapture(ride, "final_fare_required_for_capture", ride.stripePaymentIntentId);
  }

  const finalCents = Math.round(finalFare * 100);
  if (finalCents < 50) return failCompletedRideCapture(ride, "capture_amount_below_minimum", ride.stripePaymentIntentId);

  const passengerId = (ride.passengerId ?? "").trim();

  if (!piId) {
    if (!passengerId) {
      return failCompletedRideCapture(ride, "passenger_required_for_final_charge");
    }
    const resolved = await resolvePassengerSavedCardPaymentMethod(stripe, passengerId);
    const paymentMethodId = resolved.card?.paymentMethodId ?? null;
    const customerId = resolved.customerId;
    if (!paymentMethodId || !customerId) {
      return failCompletedRideCapture(ride, "payment_method_required_for_final_charge");
    }
    const connectParams = await resolveStripeConnectPaymentParams(ride.companyId, finalCents);
    const metadata: Record<string, string> = {
      ride_id: rideId,
      charge_kind: "final_fare",
      final_fare_eur: String(finalFare),
    };
    if (passengerId) metadata.passenger_id = passengerId;
    if (ride.companyId?.trim()) metadata.company_id = ride.companyId.trim();

    const charge = await chargePassengerRideFinalFare({
      stripe,
      customerId,
      paymentMethodId,
      amountCents: finalCents,
      metadata,
      connectParams,
    });

    if (charge.kind === "succeeded") {
      await markRidePaymentCaptureSucceeded(rideId, charge.paymentIntentId);
      void persistStripeFeeForRidePaymentIntentId(rideId, charge.paymentIntentId);
      return { ok: true, capturedAmountCents: finalCents, cappedToAuthorization: false };
    }
    if (charge.kind === "requires_action") {
      logger.warn({ rideId, paymentIntentId: charge.paymentIntentId }, "[Stripe] final charge requires action");
      await markRidePaymentCaptureFailed(ride, "final_charge_requires_action", charge.paymentIntentId);
      return { ok: false, error: "final_charge_requires_action" };
    }
    await markRidePaymentCaptureFailed(ride, charge.error, charge.paymentIntentId);
    return { ok: false, error: charge.error };
  }

  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(piId);
  } catch {
    return failCompletedRideCapture(ride, "invalid_payment_intent", piId);
  }

  if (isStripePaymentIntentCaptured(paymentIntent.status)) {
    await markRidePaymentCaptureSucceeded(rideId, paymentIntent.id);
    void persistStripeFeeForRidePaymentIntentId(rideId, paymentIntent.id);
    return {
      ok: true,
      capturedAmountCents: paymentIntent.amount_received ?? paymentIntent.amount,
      cappedToAuthorization: false,
    };
  }

  if (!isStripePaymentIntentAuthorized(paymentIntent.status)) {
    return failCompletedRideCapture(ride, `payment_intent_status_${paymentIntent.status}`, piId);
  }

  if (paymentIntent.amount > LEGACY_VERIFY_MAX_CENTS) {
    return captureLegacyBufferedAuthorization(ride, paymentIntent, piId, finalCents);
  }

  let paymentMethodId = paymentMethodIdFromIntent(paymentIntent);
  let customerId = customerIdFromIntent(paymentIntent);
  if ((!paymentMethodId || !customerId) && passengerId) {
    const resolved = await resolvePassengerSavedCardPaymentMethod(stripe, passengerId);
    customerId = customerId ?? resolved.customerId;
    paymentMethodId = paymentMethodId ?? resolved.card?.paymentMethodId ?? null;
  }
  if (!paymentMethodId || !customerId) {
    return failCompletedRideCapture(ride, "payment_method_required_for_final_charge", piId);
  }

  try {
    if (paymentIntent.status !== "canceled") {
      await stripe.paymentIntents.cancel(piId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, rideId, paymentIntentId: piId }, "[Stripe] cancel verify hold failed");
    return failCompletedRideCapture(ride, message || "stripe_cancel_verify_failed", piId);
  }

  const connectParams = await resolveStripeConnectPaymentParams(ride.companyId, finalCents);
  const metadata: Record<string, string> = {
    ride_id: rideId,
    charge_kind: "final_fare",
    final_fare_eur: String(finalFare),
  };
  if (passengerId) metadata.passenger_id = passengerId;
  if (ride.companyId?.trim()) metadata.company_id = ride.companyId.trim();

  const charge = await chargePassengerRideFinalFare({
    stripe,
    customerId,
    paymentMethodId,
    amountCents: finalCents,
    metadata,
    connectParams,
  });

  if (charge.kind === "succeeded") {
    await markRidePaymentCaptureSucceeded(rideId, charge.paymentIntentId);
    void persistStripeFeeForRidePaymentIntentId(rideId, charge.paymentIntentId);
    return { ok: true, capturedAmountCents: finalCents, cappedToAuthorization: false };
  }
  if (charge.kind === "requires_action") {
    logger.warn({ rideId, paymentIntentId: charge.paymentIntentId }, "[Stripe] final charge requires action");
    await markRidePaymentCaptureFailed(ride, "final_charge_requires_action", charge.paymentIntentId);
    return { ok: false, error: "final_charge_requires_action" };
  }
  await markRidePaymentCaptureFailed(ride, charge.error, charge.paymentIntentId);
  return { ok: false, error: charge.error };
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

/** Storno/Ablauf: offene 1 €-Prüfung freigeben (kein Endpreis-Capture). */
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

export async function captureRideStripePaymentById(rideId: string): Promise<CaptureRideStripePaymentResult> {
  const ride = await findRide(rideId.trim());
  if (!ride) return { ok: false, error: "ride_not_found" };
  return captureRideStripePaymentIntent(ride);
}
