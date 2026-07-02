import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { rideFinancialsTable } from "../db/schema";
import { findRide } from "../db/ridesData";
import { upsertRideFinancialSnapshot } from "../db/rideFinancialsData";
import { getStripeClient } from "./stripeClient";
import { logger } from "./logger";

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Stripe balance_transaction.fee in EUR (Plattform-Last, nicht vom Unternehmer abgezogen). */
export async function readStripeFeeEurFromPaymentIntent(
  paymentIntent: Stripe.PaymentIntent,
): Promise<number> {
  const stripe = getStripeClient();
  if (!stripe) return 0;

  const latestCharge = paymentIntent.latest_charge;
  if (!latestCharge) return 0;

  const chargeId = typeof latestCharge === "string" ? latestCharge : latestCharge.id;
  if (!chargeId) return 0;

  try {
    const charge = await stripe.charges.retrieve(chargeId, { expand: ["balance_transaction"] });
    const bt = charge.balance_transaction;
    if (typeof bt === "string") {
      const btObj = await stripe.balanceTransactions.retrieve(bt);
      return roundMoney((btObj.fee ?? 0) / 100);
    }
    if (bt && typeof bt === "object" && "fee" in bt) {
      return roundMoney((Number(bt.fee) || 0) / 100);
    }
  } catch (err) {
    logger.warn({ err, chargeId, piId: paymentIntent.id }, "[Stripe] balance_transaction fee read failed");
  }
  return 0;
}

/**
 * Nach erfolgreichem Kartenzahlungseingang: Gebühr in ride_financials speichern.
 * operator_payout_amount bleibt unverändert (ONRODA trägt Stripe).
 */
export async function persistStripeFeeOnRideFinancials(
  rideId: string,
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  const id = rideId.trim();
  if (!id) return;

  const feeEur = await readStripeFeeEurFromPaymentIntent(paymentIntent);
  if (feeEur <= 0) return;

  const db = getDb();
  if (!db) return;

  let rows = await db
    .select({ id: rideFinancialsTable.id, stripe_fee_amount: rideFinancialsTable.stripe_fee_amount })
    .from(rideFinancialsTable)
    .where(eq(rideFinancialsTable.ride_id, id))
    .limit(1);

  if (!rows[0]) {
    const ride = await findRide(id);
    if (ride) {
      await upsertRideFinancialSnapshot({ ride, reason: "stripe_fee_backfill" });
      rows = await db
        .select({ id: rideFinancialsTable.id, stripe_fee_amount: rideFinancialsTable.stripe_fee_amount })
        .from(rideFinancialsTable)
        .where(eq(rideFinancialsTable.ride_id, id))
        .limit(1);
    }
  }

  const row = rows[0];
  if (!row) return;

  const existing = Number(row.stripe_fee_amount ?? 0);
  if (existing >= feeEur - 0.001) return;

  const now = new Date();
  await db
    .update(rideFinancialsTable)
    .set({
      stripe_fee_amount: feeEur,
      updated_at: now,
    })
    .where(eq(rideFinancialsTable.id, row.id));
}

/** PI-ID laden und Gebühr persistieren (Capture-Pfad ohne volles PI-Objekt). */
export async function persistStripeFeeForRidePaymentIntentId(
  rideId: string,
  paymentIntentId: string,
): Promise<void> {
  const piId = paymentIntentId.trim();
  if (!piId) return;
  const stripe = getStripeClient();
  if (!stripe) return;
  try {
    const pi = await stripe.paymentIntents.retrieve(piId);
    await persistStripeFeeOnRideFinancials(rideId, pi);
  } catch (err) {
    logger.warn({ err, rideId, paymentIntentId: piId }, "[Stripe] fee persist: PI retrieve failed");
  }
}
