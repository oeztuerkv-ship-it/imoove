import { retryDueFailedPaymentCaptures } from "../lib/ridePaymentRecovery";
import { logger } from "../lib/logger";

export { retryDueFailedPaymentCaptures };

/** Einzel-Retry (Tests / manuell). */
export async function retryFailedRidePaymentCapture(rideId: string): Promise<boolean> {
  const { findRide } = await import("../db/ridesData.js");
  const ride = await findRide(rideId.trim());
  if (!ride || ride.paymentStatus !== "failed" || ride.status !== "completed") return false;
  const { captureRideStripePaymentIntent } = await import("../lib/stripeRideAuthorization.js");
  const outcome = await captureRideStripePaymentIntent(ride);
  return outcome.ok && !outcome.skipped;
}

export async function runFailedPaymentRecoveryCron(now: Date = new Date()): Promise<void> {
  const recovered = await retryDueFailedPaymentCaptures(now);
  if (recovered.length > 0) {
    logger.info({ count: recovered.length, rideIds: recovered }, "[Cron] Payment capture retries succeeded");
  }
}
