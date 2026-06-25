import type Stripe from "stripe";
import { insertAccessCodeAdmin } from "../db/accessCodesData.js";
import {
  attachCheckoutSessionToFixedPriceVoucherOrder,
  createFixedPriceVoucherOrder,
  getFixedPriceVoucherOrderByCheckoutSessionId,
  getFixedPriceVoucherOrderForCompany,
  markFixedPriceVoucherOrderPaid,
  type FixedPriceVoucherOrderRow,
} from "../db/fixedPriceVoucherOrdersData.js";
import { checkFixedPriceBooking } from "./fixedPriceBooking.js";
import { getStripeClient } from "./stripeClient.js";

export function partnerPanelPublicBaseUrl(): string {
  const raw =
    (process.env.PARTNER_REGISTRATION_PANEL_URL ?? "").trim() ||
    (process.env.PARTNER_PANEL_URL ?? "").trim() ||
    "https://panel.onroda.de";
  return raw.replace(/\/$/, "");
}

export type FixedPriceVoucherEstimateInput = {
  opPayload: Record<string, unknown>;
  fromFull: string;
  toFull: string;
  fromLat?: number | null;
  fromLon?: number | null;
  toLat?: number | null;
  toLon?: number | null;
  distanceKm: number;
  vehicle: string;
};

export function estimateFixedPriceVoucher(input: FixedPriceVoucherEstimateInput) {
  return checkFixedPriceBooking({
    opPayload: input.opPayload,
    from: { displayName: input.fromFull },
    to: { displayName: input.toFull },
    distanceKm: input.distanceKm,
    vehicle: input.vehicle,
  });
}

export type StartFixedPriceVoucherCheckoutInput = FixedPriceVoucherEstimateInput & {
  companyId: string;
  panelUserId: string | null;
  companyName: string;
  label?: string;
};

export async function startFixedPriceVoucherCheckout(
  input: StartFixedPriceVoucherCheckoutInput,
): Promise<
  | { ok: true; checkoutUrl: string; orderId: string }
  | { ok: false; error: string; message?: string }
> {
  const estimate = estimateFixedPriceVoucher(input);
  if (!estimate.eligible) {
    return { ok: false, error: estimate.reason, message: estimate.message };
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return { ok: false, error: "stripe_not_configured", message: "Kartenzahlung ist derzeit nicht verfügbar." };
  }

  const label =
    (input.label ?? "").trim() ||
    `Festpreis ${input.fromFull.slice(0, 40)} → ${input.toFull.slice(0, 40)}`;

  const order = await createFixedPriceVoucherOrder({
    companyId: input.companyId,
    panelUserId: input.panelUserId,
    label,
    fromFull: input.fromFull,
    toFull: input.toFull,
    fromLat: input.fromLat ?? null,
    fromLon: input.fromLon ?? null,
    toLat: input.toLat ?? null,
    toLon: input.toLon ?? null,
    distanceKm: estimate.distanceKm,
    vehicle: input.vehicle,
    priceEur: estimate.priceEur,
    basePriceEur: estimate.basePriceEur,
    vehicleSurchargeEur: estimate.vehicleSurchargeEur,
    pricingSnapshot: {
      baseFeeEur: estimate.baseFeeEur,
      perKmEur: estimate.perKmEur,
      distanceChargeEur: estimate.distanceChargeEur,
      pricingMode: "fixed_price",
    },
  });

  const panelBase = partnerPanelPublicBaseUrl();
  const amountCents = Math.round(estimate.priceEur * 100);
  if (amountCents < 50) {
    return { ok: false, error: "amount_below_minimum", message: "Mindestbetrag für Kartenzahlung nicht erreicht." };
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: amountCents,
          product_data: {
            name: "Onroda Festpreis-Gutschein",
            description: `${input.fromFull} → ${input.toFull}`.slice(0, 240),
          },
        },
      },
    ],
    metadata: {
      kind: "fixed_price_voucher",
      orderId: order.id,
      companyId: input.companyId,
    },
    success_url: `${panelBase}/?fpv_success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${panelBase}/?fpv_cancel=1`,
    client_reference_id: order.id,
  });

  if (!session.url) {
    return { ok: false, error: "checkout_session_failed", message: "Stripe Checkout konnte nicht gestartet werden." };
  }

  await attachCheckoutSessionToFixedPriceVoucherOrder(order.id, input.companyId, session.id);
  return { ok: true, checkoutUrl: session.url, orderId: order.id };
}

export async function fulfillFixedPriceVoucherFromCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<{ ok: boolean; orderId?: string; reason?: string }> {
  const meta = session.metadata ?? {};
  if (meta.kind !== "fixed_price_voucher") {
    return { ok: false, reason: "not_voucher_checkout" };
  }
  if (session.payment_status !== "paid") {
    return { ok: false, reason: "payment_not_paid" };
  }

  const orderId = String(meta.orderId ?? session.client_reference_id ?? "").trim();
  if (!orderId) return { ok: false, reason: "order_id_missing" };

  let order = await getFixedPriceVoucherOrderByCheckoutSessionId(session.id);
  if (!order) {
    const companyId = String(meta.companyId ?? "").trim();
    if (companyId) {
      order = await getFixedPriceVoucherOrderForCompany(companyId, orderId);
    }
  }

  if (!order) return { ok: false, reason: "order_not_found", orderId };
  if (order.status === "paid" && order.accessCodeId) {
    return { ok: true, orderId: order.id };
  }

  const codeResult = await insertAccessCodeAdmin({
    generate: true,
    codeType: "voucher",
    companyId: order.companyId,
    label: order.label,
    maxUses: 1,
    fixedPickup: order.fromFull,
    fixedDestination: order.toFull,
    meta: {
      fixedPriceVoucher: {
        pricingMode: "fixed_price",
        fromFull: order.fromFull,
        toFull: order.toFull,
        fromLat: order.fromLat,
        fromLon: order.fromLon,
        toLat: order.toLat,
        toLon: order.toLon,
        distanceKm: order.distanceKm,
        vehicle: order.vehicle,
        priceEur: order.priceEur,
        basePriceEur: order.basePriceEur,
        vehicleSurchargeEur: order.vehicleSurchargeEur,
        orderId: order.id,
      },
    },
  });

  if (!codeResult.ok || !codeResult.revealedCode) {
    return { ok: false, reason: codeResult.ok ? "code_reveal_missing" : codeResult.error, orderId: order.id };
  }

  const pi =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent && typeof session.payment_intent === "object"
        ? session.payment_intent.id
        : null;

  const paid = await markFixedPriceVoucherOrderPaid({
    orderId: order.id,
    stripePaymentIntentId: pi,
    accessCodeId: codeResult.item.id,
    codePlain: codeResult.revealedCode,
  });

  if (!paid) return { ok: false, reason: "mark_paid_failed", orderId: order.id };
  return { ok: true, orderId: order.id };
}

export async function resolveFixedPriceVoucherOrderAfterCheckoutReturn(
  companyId: string,
  sessionId: string,
): Promise<FixedPriceVoucherOrderRow | null> {
  const sid = sessionId.trim();
  if (!sid) return null;

  let order = await getFixedPriceVoucherOrderByCheckoutSessionId(sid);
  if (order && order.companyId !== companyId) return null;

  if (order?.status === "paid") return order;

  const stripe = getStripeClient();
  if (!stripe) return order;

  try {
    const session = await stripe.checkout.sessions.retrieve(sid);
    if (session.payment_status === "paid") {
      await fulfillFixedPriceVoucherFromCheckoutSession(session);
      order = await getFixedPriceVoucherOrderByCheckoutSessionId(sid);
      if (order && order.companyId === companyId) return order;
    }
  } catch {
    /* webhook may still complete */
  }

  return order && order.companyId === companyId ? order : null;
}
