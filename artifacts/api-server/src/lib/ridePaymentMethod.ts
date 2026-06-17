export function isStripeWalletPaymentMethod(paymentMethod: string | null | undefined): boolean {
  const pm = (paymentMethod ?? "").trim().toLowerCase();
  return pm === "card" || pm.includes("apple") || pm.includes("google");
}
