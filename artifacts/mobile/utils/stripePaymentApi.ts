import { getApiBaseUrl } from "@/utils/apiBase";
import { resolveCustomerBearerToken } from "@/utils/customerSessionToken";

const LOG_TAG = "[StripePayment]";

export type CreatePaymentIntentInput = {
  authToken?: string | null;
  amount: number;
  currency: "eur";
  rideId: string;
};

export type CreatePaymentIntentResult =
  | { ok: true; clientSecret: string }
  | { ok: false; error: string; status?: number; detail?: string };

export async function postCustomerCreatePaymentIntent(
  input: CreatePaymentIntentInput,
): Promise<CreatePaymentIntentResult> {
  const token = await resolveCustomerBearerToken(input.authToken);
  const apiBase = getApiBaseUrl();
  const url = apiBase ? `${apiBase}/customer/v1/payment/create-intent` : "";

  if (!token) {
    console.error(LOG_TAG, "create-intent: no bearer token", {
      hadLiveToken: Boolean(input.authToken?.trim()),
      apiBase: apiBase || "(empty)",
    });
    return { ok: false, error: "unauthorized", detail: "no_bearer_token" };
  }
  if (!apiBase) {
    console.error(LOG_TAG, "create-intent: api base missing", {
      envUrl: process.env.EXPO_PUBLIC_API_URL ?? "(unset)",
    });
    return { ok: false, error: "api_not_configured", detail: "no_api_base" };
  }

  const body = {
    amount: input.amount,
    currency: input.currency,
    rideId: input.rideId,
  };

  console.log(LOG_TAG, "create-intent: request", {
    url,
    rideId: input.rideId,
    amount: input.amount,
    currency: input.currency,
    tokenPrefix: token.slice(0, 12),
    tokenLength: token.length,
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(LOG_TAG, "create-intent: network error", { url, message });
    return { ok: false, error: "network_error", detail: message };
  }

  const raw = await res.text();
  let parsed: { clientSecret?: string; error?: string; message?: string } = {};
  try {
    parsed = raw ? (JSON.parse(raw) as typeof parsed) : {};
  } catch {
    parsed = {};
  }

  if (!res.ok) {
    const error = parsed.error ?? parsed.message ?? `http_${res.status}`;
    console.error(LOG_TAG, "create-intent: api error", {
      status: res.status,
      error,
      message: parsed.message ?? null,
      rideId: input.rideId,
      amount: input.amount,
      responseSnippet: raw.slice(0, 400),
    });
    return {
      ok: false,
      error,
      status: res.status,
      detail: raw.slice(0, 400),
    };
  }

  const clientSecret = typeof parsed.clientSecret === "string" ? parsed.clientSecret.trim() : "";
  if (!clientSecret) {
    console.error(LOG_TAG, "create-intent: missing clientSecret in 200 body", {
      responseSnippet: raw.slice(0, 400),
    });
    return { ok: false, error: "missing_client_secret", status: res.status, detail: raw.slice(0, 200) };
  }

  console.log(LOG_TAG, "create-intent: ok", {
    rideId: input.rideId,
    clientSecretPrefix: clientSecret.slice(0, 20),
  });
  return { ok: true, clientSecret };
}
