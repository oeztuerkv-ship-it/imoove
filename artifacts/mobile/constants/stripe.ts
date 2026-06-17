/** Stripe Publishable Key (pk_live_… / pk_test_…). */
export const STRIPE_PUBLISHABLE_KEY = (
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
).trim();

export const STRIPE_CARD_TOKEN_KEY = "@Onroda_payment_token_card";

/** Deep-Link für Stripe 3DS / Wallet-Rückkehr (muss zum App-Scheme `onroda` passen). */
export const STRIPE_URL_SCHEME = "onroda";
export const STRIPE_RETURN_URL = `${STRIPE_URL_SCHEME}://stripe-redirect`;

/** Hinweis bei Karten-/Wallet-Hinterlegung (SetupIntent, 0 €). */
export const STRIPE_SETUP_EXPLAINER_DE =
  "Karte wird zur Zahlung hinterlegt — Abbuchung erfolgt nach Fahrtende.";
