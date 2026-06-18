import type { RideRequest } from "../domain/rideRequest";
import { findRide, insertSupplementalRideEvent, updateRide } from "../db/ridesData";
import { patchRideFinancialTipAmount } from "../db/rideFinancialsData";
import { logger } from "./logger";
import { isStripeWalletPaymentMethod } from "./ridePaymentMethod";
import { getStripeClient } from "./stripeClient";
import { resolveStripeConnectTipPaymentParams } from "./stripeConnect";
import {
  chargePassengerRideFinalFare,
  resolvePassengerSavedCardPaymentMethod,
} from "./stripePassengerCustomer";

const MAX_TIP_EUR = 100;
const MIN_TIP_EUR = 0.5;

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type SubmitRideTipResult =
  | { ok: true; tipAmount: number; chargedViaStripe: boolean; idempotent?: boolean }
  | { ok: false; error: string; status: number };

export async function submitPassengerRideTip(input: {
  rideId: string;
  passengerId: string;
  amountEur: number;
}): Promise<SubmitRideTipResult> {
  const rideId = input.rideId.trim();
  const passengerId = input.passengerId.trim();
  const amountEur = roundMoney(input.amountEur);

  if (!rideId || !passengerId) {
    return { ok: false, error: "invalid_request", status: 400 };
  }
  if (amountEur < MIN_TIP_EUR || amountEur > MAX_TIP_EUR) {
    return { ok: false, error: "tip_amount_out_of_range", status: 400 };
  }

  const ride = await findRide(rideId);
  if (!ride) return { ok: false, error: "not_found", status: 404 };
  if ((ride.passengerId ?? "").trim() !== passengerId) {
    return { ok: false, error: "forbidden", status: 403 };
  }
  if (ride.status !== "completed") {
    return { ok: false, error: "ride_not_completed", status: 409 };
  }

  const existingTip = ride.tipAmount != null && Number.isFinite(Number(ride.tipAmount)) ? Number(ride.tipAmount) : 0;
  if (ride.tipPaidAt && existingTip >= MIN_TIP_EUR) {
    return { ok: true, tipAmount: existingTip, chargedViaStripe: Boolean(ride.stripeTipPaymentIntentId), idempotent: true };
  }

  const isWallet = isStripeWalletPaymentMethod(ride.paymentMethod);
  let stripeTipPaymentIntentId: string | null = null;

  if (isWallet) {
    const stripe = getStripeClient();
    if (!stripe) return { ok: false, error: "stripe_not_configured", status: 503 };

    const resolved = await resolvePassengerSavedCardPaymentMethod(stripe, passengerId);
    const paymentMethodId = resolved.card?.paymentMethodId ?? null;
    const customerId = resolved.customerId;
    if (!paymentMethodId || !customerId) {
      return { ok: false, error: "payment_method_required", status: 409 };
    }

    const tipCents = Math.round(amountEur * 100);
    const connectParams = await resolveStripeConnectTipPaymentParams(ride.companyId, tipCents);
    const charge = await chargePassengerRideFinalFare({
      stripe,
      customerId,
      paymentMethodId,
      amountCents: tipCents,
      metadata: {
        ride_id: rideId,
        charge_kind: "passenger_tip",
        tip_amount_eur: String(amountEur),
        passenger_id: passengerId,
        ...(ride.companyId?.trim() ? { company_id: ride.companyId.trim() } : {}),
      },
      connectParams,
    });

    if (charge.kind !== "succeeded") {
      const err =
        charge.kind === "requires_action"
          ? "tip_requires_action"
          : charge.kind === "failed"
            ? charge.error
            : "tip_charge_failed";
      return { ok: false, error: err, status: 402 };
    }
    stripeTipPaymentIntentId = charge.paymentIntentId;
  }

  const nowIso = new Date().toISOString();
  await updateRide(rideId, {
    tipAmount: amountEur,
    tipPaidAt: nowIso,
    stripeTipPaymentIntentId,
  });
  await patchRideFinancialTipAmount(rideId, amountEur);

  void insertSupplementalRideEvent(rideId, {
    eventType: "passenger_tip_paid",
    actorType: "passenger",
    actorId: passengerId,
    payload: {
      tipAmountEur: amountEur,
      chargedViaStripe: isWallet,
      stripeTipPaymentIntentId,
    },
  });

  logger.info(
    { rideId, amountEur, chargedViaStripe: isWallet, stripeTipPaymentIntentId },
    "[Tip] passenger tip recorded",
  );

  return { ok: true, tipAmount: amountEur, chargedViaStripe: isWallet };
}
