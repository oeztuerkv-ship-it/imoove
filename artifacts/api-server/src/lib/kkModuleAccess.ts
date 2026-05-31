import { and, eq } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "../db/client";
import { findFleetDriverInCompany } from "../db/fleetDriversData";
import { adminCompaniesTable } from "../db/schema";

import { ONRODA_KK_DENIED_MESSAGE_DE } from "./onrodaAccessMessages.js";

export const KK_MODULE_NOT_ENABLED = "kk_module_not_enabled";
export const KK_MODULE_NOT_AUTHORIZED = "kk_module_not_authorized";

export { ONRODA_KK_DENIED_MESSAGE_DE };

/** JSON-Hilfsfeld für 403-Antworten (Panel + Fleet). */
export function kkModuleDeniedJson(
  error: typeof KK_MODULE_NOT_ENABLED | typeof KK_MODULE_NOT_AUTHORIZED,
): { ok: false; error: string; message: string } {
  return { ok: false, error, message: ONRODA_KK_DENIED_MESSAGE_DE };
}

export type KkModuleCompanyFlags = {
  companyKind: string;
  featureKkModule: boolean;
};

export type KkModuleDriverFlags = {
  isOwner: boolean;
  permissionKkModule: boolean;
};

export function isTaxiCompanyKind(companyKind: string): boolean {
  return companyKind.trim().toLowerCase() === "taxi";
}

/** Mandant hat das KK-SaaS-Modul (nur Taxi). */
export function isCompanyKkModuleEnabled(company: KkModuleCompanyFlags): boolean {
  return isTaxiCompanyKind(company.companyKind) && Boolean(company.featureKkModule);
}

/** Fahrer darf KK-Funktionen nutzen (Unternehmen freigeschaltet + Inhaber oder Berechtigung). */
export function computeDriverKkModuleAccess(
  company: KkModuleCompanyFlags,
  driver: KkModuleDriverFlags,
): boolean {
  if (!isCompanyKkModuleEnabled(company)) return false;
  if (driver.isOwner) return true;
  return Boolean(driver.permissionKkModule);
}

export type KkModuleAccessResult = {
  companyEnabled: boolean;
  canAccess: boolean;
  isOwner: boolean;
  permissionKkModule: boolean;
};

export function kkModuleAccessFromRows(
  company: { company_kind: string; feature_kk_module: boolean },
  driver: { is_owner: boolean; permission_kk_module: boolean },
): KkModuleAccessResult {
  const companyEnabled = isCompanyKkModuleEnabled({
    companyKind: company.company_kind,
    featureKkModule: company.feature_kk_module,
  });
  const isOwner = Boolean(driver.is_owner);
  const permissionKkModule = Boolean(driver.permission_kk_module);
  const canAccess = computeDriverKkModuleAccess(
    { companyKind: company.company_kind, featureKkModule: company.feature_kk_module },
    { isOwner, permissionKkModule },
  );
  return { companyEnabled, canAccess, isOwner, permissionKkModule };
}

async function findCompanyKkModuleRow(companyId: string) {
  const cid = companyId.trim();
  if (!cid || !isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      company_kind: adminCompaniesTable.company_kind,
      feature_kk_module: adminCompaniesTable.feature_kk_module,
    })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.id, cid))
    .limit(1);
  return rows[0] ?? null;
}

export async function getCompanyFeatureKkModule(companyId: string): Promise<boolean> {
  const row = await findCompanyKkModuleRow(companyId);
  if (!row) return false;
  return isCompanyKkModuleEnabled({
    companyKind: row.company_kind,
    featureKkModule: row.feature_kk_module,
  });
}

export async function resolveKkModuleAccessForFleetDriver(
  companyId: string,
  fleetDriverId: string,
): Promise<KkModuleAccessResult | null> {
  const driverRow = await findFleetDriverInCompany(fleetDriverId.trim(), companyId.trim());
  if (!driverRow) return null;
  const companyRow = await findCompanyKkModuleRow(companyId);
  if (!companyRow) return null;
  return kkModuleAccessFromRows(companyRow, driverRow);
}

export async function assertKkModuleAccessForFleetDriver(
  companyId: string,
  fleetDriverId: string,
): Promise<
  | { ok: true; access: KkModuleAccessResult }
  | { ok: false; error: typeof KK_MODULE_NOT_ENABLED | typeof KK_MODULE_NOT_AUTHORIZED }
> {
  const access = await resolveKkModuleAccessForFleetDriver(companyId, fleetDriverId);
  if (!access) {
    return { ok: false, error: KK_MODULE_NOT_AUTHORIZED };
  }
  if (!access.companyEnabled) {
    return { ok: false, error: KK_MODULE_NOT_ENABLED };
  }
  if (!access.canAccess) {
    return { ok: false, error: KK_MODULE_NOT_AUTHORIZED };
  }
  return { ok: true, access };
}

export async function assertCompanyKkModuleEnabled(
  companyId: string,
): Promise<{ ok: true } | { ok: false; error: typeof KK_MODULE_NOT_ENABLED }> {
  const enabled = await getCompanyFeatureKkModule(companyId);
  if (!enabled) {
    return { ok: false, error: KK_MODULE_NOT_ENABLED };
  }
  return { ok: true };
}
