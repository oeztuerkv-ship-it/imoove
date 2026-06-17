import type { RideRequest } from "../domain/rideRequest";
import {
  liftCustomerPaymentSuspension,
  upsertCustomerPaymentSuspension,
} from "../db/customerPaymentSuspensionData";
import { insertSupplementalRideEvent, updateRide } from "../db/ridesData";
import { sendCustomerPaymentFailedEmail } from "./customerPaymentFailedMail";
import { logger } from "./logger";
import {
  notifyPassengerPaymentBlocked,
  notifyPassengerPaymentFailed,
} from "./passengerRideExpoPush";
import {
  PAYMENT_CAPTURE_MAX_ATTEMPTS,
  paymentCaptureRetryDelayMs,
} from "./ridePaymentRecoveryPolicy";
import { isStripeWalletPaymentMethod } from "./ridePaymentMethod";

function trimError(error: string): string {
  return error.trim().slice(0, 500);
}

/** Nach erfolgreichem Capture: Retry-Felder leeren, ggf. Zahlungssperre aufheben. */
export async function markRidePaymentCaptureSucceeded(
  rideId: string,
  stripePaymentIntentId?: string | null,
): Promise<void> {
  const id = rideId.trim();
  if (!id) return;
  const ride = await updateRide(id, {
    paymentStatus: "paid",
    stripePaymentIntentId: stripePaymentIntentId?.trim() || undefined,
    paymentCaptureAttemptCount: 0,
    paymentCaptureLastAttemptAt: null,
    paymentCaptureNextRetryAt: null,
    paymentCaptureLastError: null,
    paymentFailedNotifiedAt: null,
  });
  if (!ride) return;
  const pid = (ride.passengerId ?? "").trim();
  if (pid) {
    await liftCustomerPaymentSuspension(pid, null);
  }
}

/** Capture fehlgeschlagen: Retry planen, Kunde informieren, ggf. Buchungssperre. */
export async function markRidePaymentCaptureFailed(
  ride: RideRequest,
  error: string,
  stripePaymentIntentId?: string | null,
): Promise<void> {
  if (!isStripeWalletPaymentMethod(ride.paymentMethod)) return;
  const rideId = ride.id.trim();
  if (!rideId) return;

  const now = new Date();
  const prevAttempts = Math.max(0, Number(ride.paymentCaptureAttemptCount ?? 0));
  const attemptCount = prevAttempts > 0 ? prevAttempts + 1 : 1;
  const retryDelay = paymentCaptureRetryDelayMs(attemptCount);
  const hasMoreRetries = attemptCount < PAYMENT_CAPTURE_MAX_ATTEMPTS && retryDelay != null;
  const nextRetryAt = hasMoreRetries ? new Date(now.getTime() + retryDelay) : null;
  const errText = trimError(error);
  const shouldNotifyFirstFailure = !ride.paymentFailedNotifiedAt && attemptCount === 1;

  await updateRide(rideId, {
    paymentStatus: "failed",
    stripePaymentIntentId: stripePaymentIntentId?.trim() || ride.stripePaymentIntentId || null,
    paymentCaptureAttemptCount: attemptCount,
    paymentCaptureLastAttemptAt: now.toISOString(),
    paymentCaptureNextRetryAt: nextRetryAt ? nextRetryAt.toISOString() : null,
    paymentCaptureLastError: errText,
    ...(shouldNotifyFirstFailure ? { paymentFailedNotifiedAt: now.toISOString() } : {}),
  });

  await insertSupplementalRideEvent(rideId, {
    eventType: "payment_capture_failed",
    fromStatus: ride.status,
    toStatus: ride.status,
    actorType: "system",
    actorId: null,
    payload: {
      attemptCount,
      error: errText,
      nextRetryAt: nextRetryAt?.toISOString() ?? null,
      exhausted: !hasMoreRetries,
    },
  });

  const passengerId = (ride.passengerId ?? "").trim();
  if (!passengerId) return;

  if (shouldNotifyFirstFailure) {
    void notifyPassengerPaymentFailed(passengerId, rideId);
    void sendCustomerPaymentFailedEmail(
      passengerId,
      rideId,
      Number(ride.finalFare ?? ride.estimatedFare ?? 0),
    );
  }

  if (!hasMoreRetries) {
    await upsertCustomerPaymentSuspension({
      passengerId,
      outstandingRideId: rideId,
    });
    void notifyPassengerPaymentBlocked(passengerId, rideId);
    logger.warn(
      { rideId, passengerId, attemptCount, error: errText },
      "[PaymentRecovery] Capture exhausted → customer booking blocked",
    );
  } else {
    logger.warn(
      { rideId, passengerId, attemptCount, nextRetryAt: nextRetryAt?.toISOString(), error: errText },
      "[PaymentRecovery] Capture failed → retry scheduled",
    );
  }
}
