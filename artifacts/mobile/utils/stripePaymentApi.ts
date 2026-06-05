import { getApiBaseUrl } from "@/utils/apiBase";

export type CreatePaymentIntentInput = {
  authToken: string;
  amount: number;
  currency: "eur";
  rideId: string;
};

export type CreatePaymentIntentResult =
  | { ok: true; clientSecret: string }
  | { ok: false; error: string; status?: number };

export async function postCustomerCreatePaymentIntent(
  input: CreatePaymentIntentInput,
): Promise<CreatePaymentIntentResult> {
  const token = input.authToken.trim();
  if (!token) {
    return { ok: false, error: "unauthorized" };
  }
  const apiBase = getApiBaseUrl();
  if (!apiBase) {
    return { ok: false, error: "api_not_configured" };
  }
  const res = await fetch(`${apiBase}/customer/v1/payment/create-intent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency,
      rideId: input.rideId,
    }),
  });
  const raw = await res.text();
  let body: { clientSecret?: string; error?: string; message?: string } = {};
  try {
    body = raw ? (JSON.parse(raw) as typeof body) : {};
  } catch {
    body = {};
  }
  if (!res.ok) {
    return {
      ok: false,
      error: body.error ?? body.message ?? `http_${res.status}`,
      status: res.status,
    };
  }
  const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret.trim() : "";
  if (!clientSecret) {
    return { ok: false, error: "missing_client_secret", status: res.status };
  }
  return { ok: true, clientSecret };
}
