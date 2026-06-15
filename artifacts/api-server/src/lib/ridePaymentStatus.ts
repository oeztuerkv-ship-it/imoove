export const RIDE_PAYMENT_STATUSES = ["pending", "authorized", "paid", "failed", "refunded"] as const;
export type RidePaymentStatus = (typeof RIDE_PAYMENT_STATUSES)[number];

export function isRidePaymentStatus(v: string): v is RidePaymentStatus {
  return (RIDE_PAYMENT_STATUSES as readonly string[]).includes(v);
}

export function normalizeRidePaymentStatus(raw: unknown): RidePaymentStatus {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return isRidePaymentStatus(s) ? s : "pending";
}
