import { getApiBaseUrl } from "@/utils/apiBase";
import { resolveCustomerBearerToken } from "@/utils/customerSessionToken";

export type CustomerRideListItem = {
  id?: string;
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  estimatedFare?: number;
  finalFare?: number | null;
  createdAt?: string;
};

export type CustomerOutstandingPayment = {
  rideId: string;
  finalFare: number | null;
  estimatedFare: number | null;
};

export function listCustomerOutstandingFailedPayments(
  rides: CustomerRideListItem[],
): CustomerOutstandingPayment[] {
  return rides
    .filter((r) => {
      const id = typeof r.id === "string" ? r.id.trim() : "";
      const status = typeof r.status === "string" ? r.status.trim() : "";
      const paymentStatus = typeof r.paymentStatus === "string" ? r.paymentStatus.trim() : "";
      return id.length > 0 && status === "completed" && paymentStatus === "failed";
    })
    .map((r) => ({
      rideId: String(r.id).trim(),
      finalFare: typeof r.finalFare === "number" && Number.isFinite(r.finalFare) ? r.finalFare : null,
      estimatedFare:
        typeof r.estimatedFare === "number" && Number.isFinite(r.estimatedFare) ? r.estimatedFare : null,
    }))
    .sort((a, b) => (a.rideId < b.rideId ? 1 : -1));
}

export async function fetchCustomerRides(
  authToken?: string | null,
): Promise<CustomerRideListItem[]> {
  const token = (await resolveCustomerBearerToken(authToken)) ?? "";
  const apiBase = getApiBaseUrl();
  if (!token || !apiBase) return [];
  const res = await fetch(`${apiBase}/customer/v1/rides`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const body = (await res.json().catch(() => ({}))) as { items?: CustomerRideListItem[] };
  return Array.isArray(body.items) ? body.items : [];
}

const TERMINAL_STATUSES = new Set([
  "completed",
  "cancelled",
  "cancelled_by_customer",
  "cancelled_by_driver",
  "cancelled_by_system",
  "expired",
  "rejected",
]);

/** Fahrt für Wallet-Verifizierung / PaymentIntent-Metadaten (bevorzugt aktiv). */
export function pickRideIdForStripeLink(rides: CustomerRideListItem[]): string | null {
  const active = rides.find((r) => {
    const id = typeof r.id === "string" ? r.id.trim() : "";
    const status = typeof r.status === "string" ? r.status.trim() : "";
    return id.length > 0 && status.length > 0 && !TERMINAL_STATUSES.has(status);
  });
  if (active?.id) return active.id.trim();
  const any = rides.find((r) => typeof r.id === "string" && r.id.trim().length > 0);
  return any?.id?.trim() ?? null;
}

export async function cancelCustomerRide(authToken: string | null | undefined, rideId: string): Promise<void> {
  const token = (await resolveCustomerBearerToken(authToken)) ?? "";
  const id = rideId.trim();
  const apiBase = getApiBaseUrl();
  if (!token || !id || !apiBase) return;
  await fetch(`${apiBase}/customer/v1/rides/${encodeURIComponent(id)}/cancel`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  }).catch(() => undefined);
}
