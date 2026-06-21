/** Stripe-Karte/Wallet — canonical codes + Legacy-Labels aus Mobile (DE/EN). */
export function isStripeWalletPaymentMethod(paymentMethod: string | null | undefined): boolean {
  const pm = (paymentMethod ?? "").trim().toLowerCase().replace(/_/g, " ");
  if (!pm) return false;
  if (pm === "card") return true;
  if (pm.includes("kredit") || pm.includes("credit")) return true;
  if (pm.includes("apple")) return true;
  if (pm.includes("google")) return true;
  return false;
}
