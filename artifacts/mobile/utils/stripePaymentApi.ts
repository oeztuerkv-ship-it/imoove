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
  | { ok: true; cardOnFile: true; estimatedFareEur?: number }
  | {
      ok: true;
      cardOnFile: false;
      setupClientSecret: string;
      setupIntentId?: string;
      estimatedFareEur?: number;
    }
  | { ok: false; error: string; status?: number; detail?: string; rideStatus?: string };

/** Stripe client_secret → SetupIntent-ID (seti_…). */
export function stripeSetupIntentIdFromClientSecret(clientSecret: string): string {
  const secret = clientSecret.trim();
  const idx = secret.indexOf("_secret_");
  return idx > 0 ? secret.slice(0, idx) : "";
}

/** Stripe client_secret → PaymentIntent-ID (pi_…). */
export function stripePaymentIntentIdFromClientSecret(clientSecret: string): string {
  const secret = clientSecret.trim();
  const idx = secret.indexOf("_secret_");
  return idx > 0 ? secret.slice(0, idx) : "";
}

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
    setupClientSecret?: string;
    clientSecret?: string;
    cardOnFile?: boolean;
    error?: string;
    message?: string;
    rideStatus?: string;
    setupIntentId?: string;
    estimatedFareEur?: number;
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

  const estimatedFareEur =
    typeof parsed.estimatedFareEur === "number" && Number.isFinite(parsed.estimatedFareEur)
      ? parsed.estimatedFareEur
      : undefined;

  if (parsed.cardOnFile === true) {
    return {
      ok: true,
      cardOnFile: true,
      ...(estimatedFareEur != null ? { estimatedFareEur } : {}),
    };
  }

  const setupClientSecret =
    typeof parsed.setupClientSecret === "string"
      ? parsed.setupClientSecret.trim()
      : typeof parsed.clientSecret === "string"
        ? parsed.clientSecret.trim()
        : "";
  if (!setupClientSecret) {
    console.error(LOG_TAG, "create-intent: missing setupClientSecret in 200 body", {
      responseSnippet: raw.slice(0, 400),
    });
    return { ok: false, error: "missing_setup_client_secret", status: res.status, detail: raw.slice(0, 200) };
  }

  const setupIntentId =
    typeof parsed.setupIntentId === "string" && parsed.setupIntentId.trim()
      ? parsed.setupIntentId.trim()
      : stripeSetupIntentIdFromClientSecret(setupClientSecret);

  return {
    ok: true,
    cardOnFile: false,
    setupClientSecret,
    ...(setupIntentId ? { setupIntentId } : {}),
    ...(estimatedFareEur != null ? { estimatedFareEur } : {}),
  };
}

export async function confirmRideStripePayment(input: {
  rideId: string;
  paymentIntentId?: string;
  setupIntentId?: string;
  authToken?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await resolveCustomerBearerToken(input.authToken);
  const apiBase = getApiBaseUrl();
  if (!token || !apiBase) return { ok: false, error: "unauthorized" };
  const paymentIntentId = input.paymentIntentId?.trim() ?? "";
  const setupIntentId = input.setupIntentId?.trim() ?? "";
  if (!paymentIntentId && !setupIntentId) {
    return { ok: false, error: "payment_or_setup_intent_required" };
  }
  const res = await fetch(`${apiBase}/customer/v1/payment/confirm-ride`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      rideId: input.rideId,
      ...(paymentIntentId ? { paymentIntentId } : {}),
      ...(setupIntentId ? { setupIntentId } : {}),
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: typeof body.error === "string" ? body.error : `http_${res.status}` };
  }
  return { ok: true };
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

export type RetryFailedRidePaymentResult =
  | { ok: true }
  | { ok: false; error: string; status?: number };

/** Offene fehlgeschlagene Fahrtzahlung erneut einziehen (nach Karten-Update). */
export async function postCustomerRetryFailedRidePayment(input: {
  rideId: string;
  authToken?: string | null;
}): Promise<RetryFailedRidePaymentResult> {
  const token = await resolveCustomerBearerToken(input.authToken);
  const apiBase = getApiBaseUrl();
  const rideId = input.rideId.trim();
  if (!token || !apiBase || !rideId) {
    return { ok: false, error: "unauthorized" };
  }

  let res: Response;
  try {
    res = await fetch(`${apiBase}/customer/v1/payment/retry-ride/${encodeURIComponent(rideId)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }

  const raw = await res.text();
  let parsed: { error?: string; ok?: boolean } = {};
  try {
    parsed = raw ? (JSON.parse(raw) as typeof parsed) : {};
  } catch {
    parsed = {};
  }

  if (!res.ok || parsed.ok === false) {
    return {
      ok: false,
      error: typeof parsed.error === "string" ? parsed.error : `http_${res.status}`,
      status: res.status,
    };
  }

  return { ok: true };
}

export type SubmitRideTipResult =
  | { ok: true; tipAmount: number; chargedViaStripe?: boolean }
  | { ok: false; error: string; status?: number };

export async function postCustomerRideTip(input: {
  rideId: string;
  amountEur: number;
  authToken?: string | null;
}): Promise<SubmitRideTipResult> {
  const token = await resolveCustomerBearerToken(input.authToken);
  const apiBase = getApiBaseUrl();
  const rideId = input.rideId.trim();
  if (!token || !apiBase || !rideId) {
    return { ok: false, error: "unauthorized" };
  }

  let res: Response;
  try {
    res = await fetch(`${apiBase}/customer/v1/rides/${encodeURIComponent(rideId)}/tip`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ amountEur: input.amountEur }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }

  const raw = await res.text();
  let parsed: { error?: string; ok?: boolean; tipAmount?: number; chargedViaStripe?: boolean } = {};
  try {
    parsed = raw ? (JSON.parse(raw) as typeof parsed) : {};
  } catch {
    parsed = {};
  }

  if (!res.ok || parsed.ok === false) {
    return {
      ok: false,
      error: typeof parsed.error === "string" ? parsed.error : `http_${res.status}`,
      status: res.status,
    };
  }

  const tipAmount = Number(parsed.tipAmount);
  return {
    ok: true,
    tipAmount: Number.isFinite(tipAmount) ? tipAmount : input.amountEur,
    chargedViaStripe: parsed.chargedViaStripe === true,
  };
}
