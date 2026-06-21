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

export type OperatorRidePaymentCaptureRetryResult =
  | {
      ok: true;
      rideId: string;
      capturedAmountCents: number;
      cappedToAuthorization: boolean;
      alreadyPaid?: boolean;
    }
  | { ok: false; rideId: string; error: string };

/** Operator/SSH: Capture für abgeschlossene Fahrt mit pending/failed/authorized erneut anstoßen. */
export async function retryOperatorRidePaymentCapture(
  rideId: string,
  options?: { actorId?: string | null },
): Promise<OperatorRidePaymentCaptureRetryResult> {
  const id = rideId.trim();
  if (!id) return { ok: false, rideId: id, error: "ride_id_required" };

  const { findRide } = await import("../db/ridesData.js");
  const ride = await findRide(id);
  if (!ride) return { ok: false, rideId: id, error: "not_found" };
  if (ride.status !== "completed") return { ok: false, rideId: id, error: "ride_not_completed" };

  const paymentStatus = (ride.paymentStatus ?? "").trim().toLowerCase();
  if (paymentStatus === "paid") {
    return {
      ok: true,
      rideId: id,
      capturedAmountCents: 0,
      cappedToAuthorization: false,
      alreadyPaid: true,
    };
  }
  if (paymentStatus === "refunded") {
    return { ok: false, rideId: id, error: "payment_refunded" };
  }
  if (paymentStatus !== "pending" && paymentStatus !== "failed" && paymentStatus !== "authorized") {
    return { ok: false, rideId: id, error: `payment_status_${paymentStatus || "unknown"}` };
  }
  if (!isStripeWalletPaymentMethod(ride.paymentMethod)) {
    return { ok: false, rideId: id, error: "payment_method_not_stripe_wallet" };
  }

  const outcome = await captureRideStripePaymentIntent(ride);
  if (outcome.ok) {
    if (outcome.skipped) {
      return { ok: false, rideId: id, error: "capture_skipped" };
    }
    if (outcome.capturedAmountCents > 0) {
      await insertSupplementalRideEvent(id, {
        eventType: "payment_capture_operator_retry_succeeded",
        fromStatus: ride.status,
        toStatus: ride.status,
        actorType: "admin",
        actorId: options?.actorId ?? null,
        payload: {
          capturedAmountCents: outcome.capturedAmountCents,
          cappedToAuthorization: outcome.cappedToAuthorization,
        },
      });
    }
    return {
      ok: true,
      rideId: id,
      capturedAmountCents: outcome.capturedAmountCents,
      cappedToAuthorization: outcome.cappedToAuthorization,
    };
  }
  return { ok: false, rideId: id, error: outcome.error };
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
