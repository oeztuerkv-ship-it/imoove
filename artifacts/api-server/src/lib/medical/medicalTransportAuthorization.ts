import { and, eq } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "../../db/client";
import { findFleetDriverInCompany } from "../../db/fleetDriversData";
import { adminCompaniesTable } from "../../db/schema";
import { getAnthropicApiKey, isMedicalOcrEnabled } from "./claudeVisionOcr";

export const MEDICAL_TRANSPORT_NOT_AUTHORIZED = "medical_transport_not_authorized";

export type MedicalTransportAuthorizationFlags = {
  companyMedicalTransportEnabled: boolean;
  driverMedicalTransportEnabled: boolean;
  driverInheritFromCompany: boolean;
};

export type MedicalTransportAuthorizationResult = {
  companyEnabled: boolean;
  authorized: boolean;
};

/** Pure: effektive Krankenfahrt-Freigabe aus DB-Flags (Unternehmen + Fahrer/Erbe). */
export function computeMedicalTransportAuthorized(
  flags: MedicalTransportAuthorizationFlags,
): boolean {
  if (!flags.companyMedicalTransportEnabled) return false;
  if (flags.driverInheritFromCompany) return true;
  return flags.driverMedicalTransportEnabled;
}

export function medicalTransportAuthorizationFromRows(
  driverRow: {
    medical_transport_enabled: boolean;
    medical_transport_inherit_from_company: boolean;
  },
  companyRow: { medical_transport_enabled: boolean },
): MedicalTransportAuthorizationResult {
  const companyEnabled = Boolean(companyRow.medical_transport_enabled);
  const authorized = computeMedicalTransportAuthorized({
    companyMedicalTransportEnabled: companyEnabled,
    driverMedicalTransportEnabled: Boolean(driverRow.medical_transport_enabled),
    driverInheritFromCompany: Boolean(driverRow.medical_transport_inherit_from_company),
  });
  return { companyEnabled, authorized };
}

async function findCompanyMedicalTransportRow(companyId: string) {
  const cid = companyId.trim();
  if (!cid || !isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      medical_transport_enabled: adminCompaniesTable.medical_transport_enabled,
      is_active: adminCompaniesTable.is_active,
      is_blocked: adminCompaniesTable.is_blocked,
    })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.id, cid))
    .limit(1);
  return rows[0] ?? null;
}

export async function resolveMedicalTransportAuthorizationForFleetDriver(
  companyId: string,
  fleetDriverId: string,
): Promise<MedicalTransportAuthorizationResult | null> {
  const driverRow = await findFleetDriverInCompany(fleetDriverId.trim(), companyId.trim());
  if (!driverRow) return null;
  const companyRow = await findCompanyMedicalTransportRow(companyId);
  if (!companyRow) return null;
  return medicalTransportAuthorizationFromRows(driverRow, companyRow);
}

/**
 * Fahrer-/Mandanten-Gate: mindestens ein aktiver Mandant mit `medical_transport_enabled`.
 * Nicht für Kunden-Transportschein-Scan — siehe `isCustomerMedicalTransportScanAvailable`.
 */
export async function isMedicalTransportPlatformAvailable(): Promise<boolean> {
  if (!isPostgresConfigured()) return false;
  const db = getDb();
  if (!db) return false;
  const rows = await db
    .select({ id: adminCompaniesTable.id })
    .from(adminCompaniesTable)
    .where(
      and(
        eq(adminCompaniesTable.medical_transport_enabled, true),
        eq(adminCompaniesTable.is_active, true),
        eq(adminCompaniesTable.is_blocked, false),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function assertMedicalTransportAuthorizedForFleetDriver(
  companyId: string,
  fleetDriverId: string,
): Promise<{ ok: true; authorization: MedicalTransportAuthorizationResult } | { ok: false; error: typeof MEDICAL_TRANSPORT_NOT_AUTHORIZED }> {
  const authorization = await resolveMedicalTransportAuthorizationForFleetDriver(companyId, fleetDriverId);
  if (!authorization?.authorized) {
    return { ok: false, error: MEDICAL_TRANSPORT_NOT_AUTHORIZED };
  }
  return { ok: true, authorization };
}

export async function assertMedicalTransportPlatformAvailable(): Promise<
  { ok: true } | { ok: false; error: typeof MEDICAL_TRANSPORT_NOT_AUTHORIZED }
> {
  const available = await isMedicalTransportPlatformAvailable();
  if (!available) {
    return { ok: false, error: MEDICAL_TRANSPORT_NOT_AUTHORIZED };
  }
  return { ok: true };
}

/** Kunden-Scan: für jeden eingeloggten Kunden, wenn DB + OCR konfiguriert sind (ohne Mandanten-Freigabe). */
export function isCustomerMedicalTransportScanAvailable(): boolean {
  if (!isPostgresConfigured()) return false;
  return isMedicalOcrEnabled() && !!getAnthropicApiKey();
}

export function assertCustomerMedicalTransportScanAvailable():
  | { ok: true }
  | { ok: false; error: "database_not_configured" | "ocr_disabled"; status: number } {
  if (!isPostgresConfigured()) {
    return { ok: false, error: "database_not_configured", status: 503 };
  }
  if (!isMedicalOcrEnabled() || !getAnthropicApiKey()) {
    return { ok: false, error: "ocr_disabled", status: 503 };
  }
  return { ok: true };
}
