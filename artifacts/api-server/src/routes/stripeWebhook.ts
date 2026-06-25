import type { Request, Response } from "express";
import { getStripeClient } from "../lib/stripeClient.js";
import { logger } from "../lib/logger.js";
import { applyStripePaymentIntentToRide } from "../lib/stripeRidePaymentSync.js";
import { syncStripeConnectAccountFromStripe } from "../lib/stripeConnect.js";
import { fulfillFixedPriceVoucherFromCheckoutSession } from "../lib/fixedPriceVoucherFulfillment.js";

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
      case "payment_intent.payment_failed":
      case "payment_intent.amount_capturable_updated":
      case "payment_intent.canceled": {
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
      case "account.updated": {
        const account = event.data.object;
        const companyId = await syncStripeConnectAccountFromStripe(account);
        if (companyId) {
          logger.info(
            {
              companyId,
              accountId: account.id,
              chargesEnabled: account.charges_enabled,
              payoutsEnabled: account.payouts_enabled,
            },
            "[Stripe] Connect account synced from webhook",
          );
        }
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object;
        const voucherOutcome = await fulfillFixedPriceVoucherFromCheckoutSession(session);
        if (voucherOutcome.ok) {
          logger.info(
            { orderId: voucherOutcome.orderId, sessionId: session.id },
            "[Stripe] fixed-price voucher fulfilled from checkout",
          );
        } else if (voucherOutcome.reason !== "not_voucher_checkout") {
          logger.warn(
            { reason: voucherOutcome.reason, orderId: voucherOutcome.orderId, sessionId: session.id },
            "[Stripe] voucher checkout not fulfilled",
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
