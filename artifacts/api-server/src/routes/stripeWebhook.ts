import type { Request, Response } from "express";
import { getStripeClient } from "../lib/stripeClient.js";
import { logger } from "../lib/logger.js";
import { applyStripePaymentIntentToRide } from "../lib/stripeRidePaymentSync.js";

/**
 * POST /api/stripe/webhook — Rohbody (express.raw in app.ts), Signatur via STRIPE_WEBHOOK_SECRET.
 */
export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const stripe = getStripeClient();
  const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();

  if (!stripe) {
    res.status(503).json({ error: "stripe_not_configured" });
    return;
  }
  if (!webhookSecret) {
    res.status(503).json({ error: "stripe_webhook_secret_not_configured" });
    return;
  }

  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string" || !signature.trim()) {
    res.status(400).json({ error: "missing_stripe_signature" });
    return;
  }

  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    res.status(400).json({ error: "invalid_webhook_body" });
    return;
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ message }, "[Stripe] webhook signature verification failed");
    res.status(400).json({ error: "invalid_webhook_signature" });
    return;
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        const outcome = await applyStripePaymentIntentToRide(pi);
        if (outcome.applied) {
          logger.info(
            { rideId: outcome.rideId, paymentStatus: outcome.paymentStatus, eventType: event.type },
            "[Stripe] ride payment synced from webhook",
          );
        } else if (outcome.reason !== "ride_already_paid") {
          logger.warn(
            { rideId: outcome.rideId, reason: outcome.reason, eventType: event.type, piId: pi.id },
            "[Stripe] webhook PI not applied to ride",
          );
        }
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    logger.error({ err, eventType: event.type }, "[Stripe] webhook handler error");
    res.status(500).json({ error: "webhook_handler_failed" });
  }
}
