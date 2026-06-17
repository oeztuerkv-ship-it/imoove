import Stripe from "stripe";
import type { Response } from "express";
import { logger } from "./logger";

/**
 * Stripe-/Zahlungsfehler als JSON statt nacktem HTTP 500 (Mobile zeigt sonst nur `http_500`).
 * @returns true wenn geantwortet wurde
 */
export function respondCustomerPaymentRouteError(
  res: Response,
  e: unknown,
  logContext: string,
): boolean {
  if (e instanceof Stripe.errors.StripeError) {
    const stripeCode = (e.code ?? e.type ?? "stripe_error").trim();
    const status =
      typeof e.statusCode === "number" && e.statusCode >= 400 && e.statusCode < 600
        ? e.statusCode
        : 502;
    logger.warn(
      { err: e, context: logContext, stripeCode, stripeType: e.type },
      "[Stripe] customer payment route error",
    );
    res.status(status).json({
      error: stripeCode,
      message: e.message,
      stripeType: e.type,
    });
    return true;
  }
  if (e instanceof Error && e.message.trim() === "passenger_id_required") {
    res.status(400).json({ error: "passenger_id_required" });
    return true;
  }
  return false;
}
