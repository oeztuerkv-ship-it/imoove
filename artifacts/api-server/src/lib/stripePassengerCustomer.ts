import type Stripe from "stripe";

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
