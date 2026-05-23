import { getApiBaseUrl } from "@/utils/apiBase";

const API_URL = getApiBaseUrl();

export type CustomerAuthDto = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
};

export type RegisterCustomerResult =
  | { ok: true; sessionToken: string; customer: CustomerAuthDto }
  | { ok: false; error: string; status: number };

export async function registerCustomerWithPassword(body: {
  email: string;
  proofToken: string;
  name: string;
  phone: string;
  password: string;
  passwordConfirm: string;
}): Promise<RegisterCustomerResult> {
  if (!API_URL?.trim()) {
    return { ok: false, error: "api_not_configured", status: 503 };
  }
  const res = await fetch(`${API_URL}/auth/customer/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: body.email.trim().toLowerCase(),
      proofToken: body.proofToken.trim(),
      name: body.name.trim(),
      phone: body.phone.trim(),
      password: body.password,
      passwordConfirm: body.passwordConfirm,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    sessionToken?: string;
    customer?: CustomerAuthDto;
  };
  if (!res.ok || data?.ok === false) {
    return {
      ok: false,
      error: typeof data?.error === "string" ? data.error : "register_failed",
      status: res.status,
    };
  }
  const token = typeof data.sessionToken === "string" ? data.sessionToken.trim() : "";
  if (!token || !data.customer?.id) {
    return { ok: false, error: "invalid_response", status: 502 };
  }
  return { ok: true, sessionToken: token, customer: data.customer };
}

export function mapCustomerAuthApiError(code: unknown): string {
  const k = typeof code === "string" ? code : "";
  if (k === "invalid_params") return "Bitte alle Felder prüfen.";
  if (k === "password_too_short") return "Passwort: mindestens 8 Zeichen.";
  if (k === "password_needs_special") return "Passwort: mindestens ein Sonderzeichen (z. B. Punkt).";
  if (k === "password_mismatch") return "Passwörter stimmen nicht überein.";
  if (k === "invalid_proof_token") return "E-Mail-Bestätigung abgelaufen — bitte Code erneut anfordern.";
  if (k === "account_exists") return "Diese E-Mail ist bereits registriert.";
  if (k === "database_not_configured") return "Server noch nicht bereit.";
  if (k === "session_token_failed") return "Anmeldung konnte nicht abgeschlossen werden.";
  return "Registrierung fehlgeschlagen — bitte erneut versuchen.";
}
