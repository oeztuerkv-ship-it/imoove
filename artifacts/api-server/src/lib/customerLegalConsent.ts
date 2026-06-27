import { getLegalConsentVersions } from "../db/legalPagesData";
import {
  getPassengerLegalConsent,
  passengerHasLegalConsent,
  recordPassengerLegalConsent,
  type PassengerLegalConsentRow,
} from "../db/customerLegalConsentData";

export type LegalConsentStatusDto = {
  hasConsent: boolean;
  termsAcceptedAt: string | null;
  privacyAcceptedAt: string | null;
  termsVersion: string;
  privacyVersion: string;
};

export type LegalConsentVersionsDto = {
  agb: { version: string; standLabel: string; updatedAt: string | null };
  datenschutz: { version: string; standLabel: string; updatedAt: string | null };
};

function toStatusDto(row: PassengerLegalConsentRow | null): LegalConsentStatusDto {
  const hasConsent = row != null && passengerHasLegalConsent(row);
  return {
    hasConsent,
    termsAcceptedAt: row?.termsAcceptedAt?.toISOString() ?? null,
    privacyAcceptedAt: row?.privacyAcceptedAt?.toISOString() ?? null,
    termsVersion: row?.termsVersion ?? "",
    privacyVersion: row?.privacyVersion ?? "",
  };
}

export async function fetchLegalConsentVersions(): Promise<
  | { ok: true; versions: LegalConsentVersionsDto }
  | { ok: false; error: "database_not_configured" | "legal_versions_unavailable" }
> {
  const versions = await getLegalConsentVersions();
  if (!versions) {
    return { ok: false, error: "legal_versions_unavailable" };
  }
  return { ok: true, versions };
}

export async function getCustomerLegalConsentStatus(
  passengerId: string,
): Promise<LegalConsentStatusDto> {
  const row = await getPassengerLegalConsent(passengerId);
  return toStatusDto(row);
}

export async function acceptCustomerLegalConsent(opts: {
  passengerId: string;
  acceptLegal: boolean;
}): Promise<
  | { ok: true; status: LegalConsentStatusDto }
  | { ok: false; error: string; status: number }
> {
  if (opts.acceptLegal !== true) {
    return { ok: false, error: "legal_acceptance_required", status: 400 };
  }

  const versionsOutcome = await fetchLegalConsentVersions();
  if (!versionsOutcome.ok) {
    return { ok: false, error: versionsOutcome.error, status: 503 };
  }

  const { agb, datenschutz } = versionsOutcome.versions;
  await recordPassengerLegalConsent({
    passengerId: opts.passengerId,
    termsVersion: agb.version,
    privacyVersion: datenschutz.version,
  });

  const status = await getCustomerLegalConsentStatus(opts.passengerId);
  return { ok: true, status };
}

/** true = explizite Checkbox; fehlend/undefined = Legacy-App ohne acceptLegal-Feld (E-Mail-Flow). */
export function isLegalConsentAcceptedForRegistration(acceptLegal: unknown): boolean {
  if (acceptLegal === false) return false;
  if (acceptLegal === true) return true;
  // Ältere Mobile-Builds senden acceptLegal nicht — Zustimmung wird serverseitig beim Abschluss gespeichert.
  return acceptLegal === undefined || acceptLegal === null;
}

export async function requireLegalConsentForRegistration(
  acceptLegal: unknown,
): Promise<
  | { ok: true; termsVersion: string; privacyVersion: string; acceptedAt: Date }
  | { ok: false; error: string; status: number }
> {
  if (!isLegalConsentAcceptedForRegistration(acceptLegal)) {
    return { ok: false, error: "legal_acceptance_required", status: 400 };
  }
  const versionsOutcome = await fetchLegalConsentVersions();
  if (!versionsOutcome.ok) {
    return { ok: false, error: versionsOutcome.error, status: 503 };
  }
  return {
    ok: true,
    termsVersion: versionsOutcome.versions.agb.version,
    privacyVersion: versionsOutcome.versions.datenschutz.version,
    acceptedAt: new Date(),
  };
}
