import Stripe from "stripe";
import type { StripeConnectPaymentParams } from "./stripeConnect";

export type SavedStripeCard = {
  paymentMethodId: string;
  brand: string | null;
  last4: string | null;
};

/** Stripe Customer pro Passenger (metadata `passenger_id`) für SetupIntent / gespeicherte Karten. */
export async function getOrCreateStripeCustomerForPassenger(
  stripe: Stripe,
  passengerId: string,
  email?: string | null,
): Promise<string> {
  const pid = passengerId.trim();
  if (!pid) {
    throw new Error("passenger_id_required");
  }
  const escaped = pid.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const search = await stripe.customers.search({
    query: `metadata['passenger_id']:'${escaped}'`,
    limit: 1,
  });
  const existing = search.data[0];
  if (existing?.id) return existing.id;

  const mail = typeof email === "string" ? email.trim() : "";
  const created = await stripe.customers.create({
    ...(mail ? { email: mail } : {}),
    metadata: { passenger_id: pid },
  });
  return created.id;
}

/** Standard- oder neueste hinterlegte Karte des Stripe Customers. */
export async function resolveStripeCustomerSavedCard(
  stripe: Stripe,
  customerId: string,
): Promise<SavedStripeCard | null> {
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;

  const defaultPm = customer.invoice_settings?.default_payment_method;
  const defaultPmId =
    typeof defaultPm === "string" ? defaultPm.trim() : typeof defaultPm?.id === "string" ? defaultPm.id.trim() : "";

  if (defaultPmId) {
    const pm = await stripe.paymentMethods.retrieve(defaultPmId);
    if (pm.type === "card" && pm.card) {
      return {
        paymentMethodId: pm.id,
        brand: pm.card.brand ?? null,
        last4: pm.card.last4 ?? null,
      };
    }
  }

  const list = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 3 });
  const pm = list.data[0];
  if (!pm?.card) return null;

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: pm.id },
  });

  return {
    paymentMethodId: pm.id,
    brand: pm.card.brand ?? null,
    last4: pm.card.last4 ?? null,
  };
}

export async function resolvePassengerSavedCardPaymentMethod(
  stripe: Stripe,
  passengerId: string,
  email?: string | null,
): Promise<{ customerId: string; card: SavedStripeCard | null }> {
  const customerId = await getOrCreateStripeCustomerForPassenger(stripe, passengerId, email);
  const card = await resolveStripeCustomerSavedCard(stripe, customerId);
  return { customerId, card };
}

export type ChargeSavedCardResult =
  | { kind: "succeeded"; paymentIntentId: string }
  | { kind: "requires_action"; clientSecret: string; paymentIntentId: string }
  | { kind: "failed"; error: string };

/** Gespeicherte Karte off-session belasten (ggf. 3DS → requires_action + clientSecret). */
export async function chargePassengerSavedCard(input: {
  stripe: Stripe;
  customerId: string;
  paymentMethodId: string;
  amountCents: number;
  metadata: Record<string, string>;
  connectParams?: StripeConnectPaymentParams | null;
}): Promise<ChargeSavedCardResult> {
  try {
    const intent = await input.stripe.paymentIntents.create({
      amount: input.amountCents,
      currency: "eur",
      customer: input.customerId,
      payment_method: input.paymentMethodId,
      off_session: true,
      confirm: true,
      metadata: input.metadata,
      ...(input.connectParams ?? {}),
    });
    if (intent.status === "succeeded") {
      return { kind: "succeeded", paymentIntentId: intent.id };
    }
    const clientSecret = intent.client_secret?.trim();
    if (intent.status === "requires_action" && clientSecret) {
      return { kind: "requires_action", clientSecret, paymentIntentId: intent.id };
    }
    return { kind: "failed", error: "payment_not_completed" };
  } catch (err) {
    if (err instanceof Stripe.errors.StripeCardError) {
      const pi = err.payment_intent;
      if (pi && typeof pi === "object" && pi.status === "requires_action") {
        const clientSecret = pi.client_secret?.trim();
        if (clientSecret) {
          return { kind: "requires_action", clientSecret, paymentIntentId: pi.id };
        }
      }
      return { kind: "failed", error: err.code ?? "card_declined" };
    }
    throw err;
  }
}
