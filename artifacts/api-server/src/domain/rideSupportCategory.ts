/**
 * Kund*innen-Support (Fahrt) — stabile API-Keys, UI-Labels in Mobile/Admin.
 */
export const RIDE_SUPPORT_CATEGORIES = [
  "driver_not_arrived",
  "wrong_price",
  "wrong_address",
  "cancel_or_issue",
  "payment_receipt",
  "special_request",
  "other",
] as const;

export type RideSupportCategory = (typeof RIDE_SUPPORT_CATEGORIES)[number];

export function isRideSupportCategory(v: string): v is RideSupportCategory {
  return (RIDE_SUPPORT_CATEGORIES as readonly string[]).includes(v);
}

export function parseRideSupportCategory(v: unknown): RideSupportCategory | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  return isRideSupportCategory(s) ? s : null;
}
