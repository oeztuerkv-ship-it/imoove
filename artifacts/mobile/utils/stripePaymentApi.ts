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
  | { ok: false; error: string; status?: number; detail?: string; rideStatus?: string };

/** Nutzer-Alert inkl. exaktem API-Fehlercode (TestFlight-Diagnose). */
export function formatStripePaymentIntentAlertMessage(
  userMessage: string,
  result: Extract<CreatePaymentIntentResult, { ok: false }>,
): string {
  const httpPart =
    typeof result.status === "number" ? `\nHTTP: ${result.status}` : "";
  const statusPart =
    typeof result.rideStatus === "string" && result.rideStatus.trim()
      ? `\nFahrt-Status: ${result.rideStatus.trim()}`
      : "";
  return `${userMessage}\n\nAPI-Code: ${result.error}${httpPart}${statusPart}`;
}

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
  let parsed: { clientSecret?: string; error?: string; message?: string; rideStatus?: string } = {};
  try {
    parsed = raw ? (JSON.parse(raw) as typeof parsed) : {};
  } catch {
    parsed = {};
  }

  if (!res.ok) {
    const error = parsed.error ?? parsed.message ?? `http_${res.status}`;
    const rideStatus =
      typeof parsed.rideStatus === "string" ? parsed.rideStatus.trim() : undefined;
    console.error(LOG_TAG, "create-intent: api error", {
      status: res.status,
      error,
      message: parsed.message ?? null,
      rideStatus: rideStatus ?? null,
      rideId: input.rideId,
      amount: input.amount,
      responseSnippet: raw.slice(0, 400),
    });
    return {
      ok: false,
      error,
      status: res.status,
      detail: raw.slice(0, 400),
      ...(rideStatus ? { rideStatus } : {}),
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

export type CreateSetupIntentInput = {
  authToken?: string | null;
};

export type CreateSetupIntentResult =
  | { ok: true; clientSecret: string }
  | { ok: false; error: string; status?: number; detail?: string };

/** SetupIntent ohne Fahrt (Wallet / gespeicherte Karte) — Route: POST …/payment/setup-intent */
export async function postCustomerCreateSetupIntent(
  input: CreateSetupIntentInput,
): Promise<CreateSetupIntentResult> {
  const token = await resolveCustomerBearerToken(input.authToken);
  const apiBase = getApiBaseUrl();
  const url = apiBase ? `${apiBase}/customer/v1/payment/setup-intent` : "";

  if (!token) {
    return { ok: false, error: "unauthorized", detail: "no_bearer_token" };
  }
  if (!apiBase) {
    return { ok: false, error: "api_not_configured", detail: "no_api_base" };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(LOG_TAG, "setup-intent: network error", { url, message });
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
    return { ok: false, error, status: res.status, detail: raw.slice(0, 400) };
  }

  const clientSecret = typeof parsed.clientSecret === "string" ? parsed.clientSecret.trim() : "";
  if (!clientSecret) {
    return { ok: false, error: "missing_client_secret", status: res.status, detail: raw.slice(0, 200) };
  }

  return { ok: true, clientSecret };
}
