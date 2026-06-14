import { API_BASE } from "./apiBase.js";

/**
 * @param {string} token
 * @returns {Promise<{ ok: true, stripeConnect: Record<string, unknown> } | { ok: false, error: string }>}
 */
export async function fetchStripeConnectStatus(token) {
  try {
    const res = await fetch(`${API_BASE}/panel/v1/stripe-connect`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      return { ok: false, error: typeof data?.error === "string" ? data.error : "status_load_failed" };
    }
    return { ok: true, stripeConnect: data.stripeConnect ?? {} };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/**
 * @param {string} token
 * @returns {Promise<{ ok: true, url: string } | { ok: false, error: string }>}
 */
export async function createStripeConnectOnboardingLink(token) {
  try {
    const res = await fetch(`${API_BASE}/panel/v1/stripe-connect/onboarding-link`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok || typeof data.url !== "string" || !data.url.trim()) {
      return { ok: false, error: typeof data?.error === "string" ? data.error : "onboarding_link_failed" };
    }
    return { ok: true, url: data.url.trim() };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/** Lesbare Fehlermeldungen für Partner-UI. */
export function stripeConnectErrorDe(code) {
  switch (code) {
    case "stripe_not_configured":
      return "Kartenauszahlung ist derzeit noch nicht freigeschaltet. Bitte wenden Sie sich an ONRODA.";
    case "payout_not_allowed":
      return "Auszahlungen sind für Ihren Mandanten noch nicht freigegeben.";
    case "forbidden":
    case "module_disabled":
      return "Keine Berechtigung für Auszahlungseinstellungen.";
    case "network_error":
      return "Netzwerkfehler — bitte erneut versuchen.";
    default:
      return "Aktion fehlgeschlagen. Bitte später erneut versuchen oder Support kontaktieren.";
  }
}
