import type { Request, Response } from "express";
import type Stripe from "stripe";
import { getStripeClient } from "../lib/stripeClient.js";
import { logger } from "../lib/logger.js";
import { applyStripePaymentIntentToRide } from "../lib/stripeRidePaymentSync.js";
import { persistStripeFeeOnRideFinancials } from "../lib/stripeRideFinancialFee.js";
import { syncStripeConnectAccountFromStripe } from "../lib/stripeConnect.js";
import { fulfillFixedPriceVoucherFromCheckoutSession } from "../lib/fixedPriceVoucherFulfillment.js";
import {
  findRideIdByStripePaymentIntentId,
  recordRidePaymentReversalAdjustment,
} from "../db/rideFinancialAdjustmentsData.js";

function paymentIntentIdFromCharge(charge: Stripe.Charge): string | null {
  const pi = charge.payment_intent;
  if (typeof pi === "string" && pi.trim()) return pi.trim();
  if (pi && typeof pi === "object" && typeof pi.id === "string" && pi.id.trim()) return pi.id.trim();
  return null;
}

async function recordReversalFromStripe(input: {
  kind: "refund" | "chargeback";
  paymentIntentId: string | null;
  externalRef: string;
  amountCents: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const pi = (input.paymentIntentId ?? "").trim();
  const externalRef = input.externalRef.trim();
  if (!pi || !externalRef) return;
  const rideId = await findRideIdByStripePaymentIntentId(pi);
  if (!rideId) {
    logger.warn(
      { paymentIntentId: pi, kind: input.kind, externalRef },
      "[Stripe] finance adjustment skipped — no ride for payment_intent",
    );
    return;
  }
  const refundGrossEur = Math.max(0, input.amountCents) / 100;
  const outcome = await recordRidePaymentReversalAdjustment({
    rideId,
    kind: input.kind,
    refundGrossEur,
    externalRef,
    actorType: "system",
    actorId: "stripe_webhook",
    metadata: { ...(input.metadata ?? {}), paymentIntentId: pi, source: "stripe_webhook" },
  });
  if (!outcome.ok) {
    logger.warn(
      { rideId, kind: input.kind, externalRef, error: outcome.error },
      "[Stripe] finance adjustment ledger write failed",
    );
    return;
  }
  logger.info(
    {
      rideId,
      kind: input.kind,
      externalRef,
      adjustmentId: outcome.adjustment.id,
      idempotent: Boolean(outcome.idempotent),
    },
    "[Stripe] finance adjustment recorded",
  );
}

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
          if (outcome.paymentStatus === "paid") {
            await persistStripeFeeOnRideFinancials(outcome.rideId, pi);
          }
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
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const pi = paymentIntentIdFromCharge(charge);
        const refunds = charge.refunds?.data ?? [];
        if (refunds.length === 0) {
          // Fallback: gesamter Charge-Betrag als eine Korrektur (selten ohne Refund-Liste).
          await recordReversalFromStripe({
            kind: "refund",
            paymentIntentId: pi,
            externalRef: `charge_refunded:${charge.id}`,
            amountCents: charge.amount_refunded ?? charge.amount ?? 0,
            metadata: { chargeId: charge.id, eventType: event.type },
          });
          break;
        }
        for (const refund of refunds) {
          if (!refund?.id) continue;
          await recordReversalFromStripe({
            kind: "refund",
            paymentIntentId: pi,
            externalRef: refund.id,
            amountCents: refund.amount ?? 0,
            metadata: { chargeId: charge.id, eventType: event.type },
          });
        }
        break;
      }
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const chargeObj = dispute.charge;
        let pi: string | null = null;
        if (typeof chargeObj === "string" && chargeObj.trim()) {
          try {
            const charge = await stripe.charges.retrieve(chargeObj.trim());
            pi = paymentIntentIdFromCharge(charge);
          } catch (err) {
            logger.warn({ err, chargeId: chargeObj }, "[Stripe] dispute charge retrieve failed");
          }
        } else if (chargeObj && typeof chargeObj === "object") {
          pi = paymentIntentIdFromCharge(chargeObj as Stripe.Charge);
        }
        if (!pi && typeof dispute.payment_intent === "string") {
          pi = dispute.payment_intent.trim() || null;
        } else if (
          !pi &&
          dispute.payment_intent &&
          typeof dispute.payment_intent === "object" &&
          typeof dispute.payment_intent.id === "string"
        ) {
          pi = dispute.payment_intent.id.trim() || null;
        }
        await recordReversalFromStripe({
          kind: "chargeback",
          paymentIntentId: pi,
          externalRef: dispute.id,
          amountCents: dispute.amount ?? 0,
          metadata: {
            chargeId: typeof chargeObj === "string" ? chargeObj : (chargeObj as Stripe.Charge | null)?.id,
            reason: dispute.reason,
            status: dispute.status,
            eventType: event.type,
          },
        });
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
