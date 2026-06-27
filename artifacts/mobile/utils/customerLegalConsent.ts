import { getApiBaseUrl } from "@/utils/apiBase";
import * as Linking from "expo-linking";

export const ONRODA_LEGAL_URLS = {
  agb: "https://onroda.de/agb",
  datenschutz: "https://onroda.de/datenschutz",
} as const;

export type LegalConsentVersions = {
  agb: { version: string; standLabel: string; updatedAt: string | null };
  datenschutz: { version: string; standLabel: string; updatedAt: string | null };
};

export type CustomerLegalStatus = {
  hasConsent: boolean;
  termsAcceptedAt: string | null;
  privacyAcceptedAt: string | null;
  termsVersion: string;
  privacyVersion: string;
};

export function openOnrodaLegalPage(slug: keyof typeof ONRODA_LEGAL_URLS): void {
  void Linking.openURL(ONRODA_LEGAL_URLS[slug]);
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function fetchLegalConsentVersions(): Promise<
  { ok: true; versions: LegalConsentVersions } | { ok: false; error: string }
> {
  const base = getApiBaseUrl()?.trim().replace(/\/+$/, "");
  if (!base) {
    return { ok: false, error: "api_not_configured" };
  }
  const res = await fetch(`${base}/public/legal-pages/consent-versions`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const data = await readJson(res);
  if (!res.ok || data.ok === false) {
    return {
      ok: false,
      error: typeof data.error === "string" ? data.error : "legal_versions_unavailable",
    };
  }
  const versions = data.versions as LegalConsentVersions | undefined;
  if (!versions?.agb?.version || !versions?.datenschutz?.version) {
    return { ok: false, error: "invalid_response" };
  }
  return { ok: true, versions };
}

export async function fetchCustomerLegalStatus(
  sessionToken: string,
): Promise<{ ok: true; status: CustomerLegalStatus } | { ok: false; error: string }> {
  const base = getApiBaseUrl()?.trim().replace(/\/+$/, "");
  const token = sessionToken.trim();
  if (!base || !token) {
    return { ok: false, error: "api_not_configured" };
  }
  const res = await fetch(`${base}/auth/customer/legal-status`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  const data = await readJson(res);
  if (!res.ok || data.ok === false) {
    return {
      ok: false,
      error: typeof data.error === "string" ? data.error : "legal_status_failed",
    };
  }
  const status = data.status as CustomerLegalStatus | undefined;
  if (!status || typeof status.hasConsent !== "boolean") {
    return { ok: false, error: "invalid_response" };
  }
  return { ok: true, status };
}

export async function recordCustomerLegalAcceptance(
  sessionToken: string,
): Promise<{ ok: true; status: CustomerLegalStatus } | { ok: false; error: string }> {
  const base = getApiBaseUrl()?.trim().replace(/\/+$/, "");
  const token = sessionToken.trim();
  if (!base || !token) {
    return { ok: false, error: "api_not_configured" };
  }
  const res = await fetch(`${base}/auth/customer/legal-acceptance`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ acceptLegal: true }),
  });
  const data = await readJson(res);
  if (!res.ok || data.ok === false) {
    return {
      ok: false,
      error: typeof data.error === "string" ? data.error : "legal_acceptance_failed",
    };
  }
  const status = data.status as CustomerLegalStatus | undefined;
  if (!status) {
    return { ok: false, error: "invalid_response" };
  }
  return { ok: true, status };
}

export function mapCustomerLegalError(code: unknown): string {
  const k = typeof code === "string" ? code : "";
  if (k === "legal_acceptance_required") {
    return "Bitte AGB und Datenschutzerklärung akzeptieren.";
  }
  if (k === "legal_versions_unavailable" || k === "database_not_configured") {
    return "Rechtstexte momentan nicht verfügbar — bitte später erneut versuchen.";
  }
  return "Zustimmung konnte nicht gespeichert werden — bitte erneut versuchen.";
}
