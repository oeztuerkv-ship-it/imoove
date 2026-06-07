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
  | { ok: true; paid: true; paymentIntentId?: string }
  | { ok: true; paid: false; clientSecret: string; requiresAction?: boolean }
  | { ok: false; error: string; status?: number; detail?: string; rideStatus?: string };

export type CustomerSavedCardResult =
  | { ok: true; saved: true; brand: string | null; last4: string | null }
  | { ok: true; saved: false }
  | { ok: false; error: string; status?: number };

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
  let parsed: {
    clientSecret?: string;
    error?: string;
    message?: string;
    rideStatus?: string;
    paid?: boolean;
    paymentIntentId?: string;
    requiresAction?: boolean;
  } = {};
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

  if (parsed.paid === true) {
    console.log(LOG_TAG, "create-intent: paid off-session", {
      rideId: input.rideId,
      paymentIntentId: parsed.paymentIntentId ?? null,
    });
    return {
      ok: true,
      paid: true,
      ...(typeof parsed.paymentIntentId === "string" ? { paymentIntentId: parsed.paymentIntentId } : {}),
    };
  }

  const clientSecret = typeof parsed.clientSecret === "string" ? parsed.clientSecret.trim() : "";
  if (!clientSecret) {
    console.error(LOG_TAG, "create-intent: missing clientSecret in 200 body", {
      responseSnippet: raw.slice(0, 400),
    });
    return { ok: false, error: "missing_client_secret", status: res.status, detail: raw.slice(0, 200) };
  }

  console.log(LOG_TAG, "create-intent: payment sheet", {
    rideId: input.rideId,
    requiresAction: parsed.requiresAction === true,
    clientSecretPrefix: clientSecret.slice(0, 20),
  });
  return {
    ok: true,
    paid: false,
    clientSecret,
    ...(parsed.requiresAction === true ? { requiresAction: true } : {}),
  };
}

export async function fetchCustomerSavedCard(
  authToken?: string | null,
): Promise<CustomerSavedCardResult> {
  const token = await resolveCustomerBearerToken(authToken);
  const apiBase = getApiBaseUrl();
  const url = apiBase ? `${apiBase}/customer/v1/payment/saved-card` : "";

  if (!token) {
    return { ok: false, error: "unauthorized" };
  }
  if (!apiBase) {
    return { ok: false, error: "api_not_configured" };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }

  const raw = await res.text();
  let parsed: { saved?: boolean; brand?: string | null; last4?: string | null; error?: string } = {};
  try {
    parsed = raw ? (JSON.parse(raw) as typeof parsed) : {};
  } catch {
    parsed = {};
  }

  if (!res.ok) {
    return { ok: false, error: parsed.error ?? `http_${res.status}`, status: res.status };
  }

  if (parsed.saved === true) {
    return {
      ok: true,
      saved: true,
      brand: typeof parsed.brand === "string" ? parsed.brand : null,
      last4: typeof parsed.last4 === "string" ? parsed.last4 : null,
    };
  }

  return { ok: true, saved: false };
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
