/** Stripe Publishable Key (pk_live_… / pk_test_…). */
export const STRIPE_PUBLISHABLE_KEY = (
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
).trim();

export const STRIPE_CARD_TOKEN_KEY = "@Onroda_payment_token_card";
