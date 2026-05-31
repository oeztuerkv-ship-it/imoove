import { and, count, eq } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { getDerivedGlobalComplianceStatusForCompanyRow } from "./companyComplianceDocumentsData";
import { adminCompaniesTable, fleetDriversTable, fleetVehiclesTable } from "./schema";

export interface CompanyGovernanceGate {
  companyId: string;
  companyKind: string;
  verificationStatus: string;
  complianceStatus: string;
  contractStatus: string;
  isBlocked: boolean;
  hasComplianceGewerbe: boolean;
  hasComplianceInsurance: boolean;
  maxDrivers: number;
  maxVehicles: number;
  requiredProfileComplete: boolean;
  farePermissions: Record<string, unknown>;
  insurerPermissions: Record<string, unknown>;
  areaAssignments: string[];
  /** Taxi-Konzessionsnummer in Stammdaten (Onroda-Prüfung). */
  concessionNumberPresent: boolean;
}

/**
 * Fahrer-App / Partner „In der App freigeschaltet“: nur Plattform-Pflicht (Unternehmer-Zugang, Konzession, Kennzeichen).
 * P-Schein, Fahrzeugzuweisung und Fahrer-Unterlagen sind Sache des Unternehmers — nicht blockieren.
 */
export function companyMeetsTaxiDriverAppAccess(
  gate: CompanyGovernanceGate | null,
  hasFleetVehicleWithLicensePlate: boolean,
): boolean {
  if (!gate) return false;
  if (gate.companyKind !== "taxi") return false;
  if (gate.isBlocked) return false;
  if (gate.contractStatus !== "active") return false;
  if (!gate.concessionNumberPresent) return false;
  if (!hasFleetVehicleWithLicensePlate) return false;
  return true;
}

/** Einsatz/Vermittlung (Anlage Limits, volle Governance); strenger als Fahrer-App-Zugang. */
export function companyMeetsTaxiFleetProvisioningReadiness(gate: CompanyGovernanceGate | null): boolean {
  if (!gate) return false;
  if (gate.companyKind !== "taxi") return false;
  if (gate.isBlocked) return false;
  if (gate.verificationStatus !== "verified") return false;
  if (gate.complianceStatus !== "compliant") return false;
  if (gate.contractStatus !== "active") return false;
  if (!gate.requiredProfileComplete) return false;
  return true;
}

/** Nur für Fahrer-Login: Firma ohne `is_active`-Filter laden, klare Fehlercodes statt Sammel-`company_access_blocked`. */
export type FleetLoginCompanyDenyReason =
  | "company_not_found"
  | "company_inactive"
  | "company_blocked"
  | "contract_not_active";

/** Onboarding „Freigegeben“, aber Vertrag noch inactive — nachziehen (Legacy nach alter Freischalt-Logik). */
export async function reconcileTaxiFreischaltungForFleetLogin(companyId: string): Promise<void> {
  if (!isPostgresConfigured()) return;
  const db = getDb();
  if (!db) return;
  const rows = await db
    .select({
      company_kind: adminCompaniesTable.company_kind,
      onboarding_status: adminCompaniesTable.onboarding_status,
      contract_status: adminCompaniesTable.contract_status,
    })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.id, companyId))
    .limit(1);
  const r = rows[0];
  if (!r || String(r.company_kind ?? "") !== "taxi") return;
  if (String(r.onboarding_status ?? "") !== "approved") return;
  if (String(r.contract_status ?? "") === "active") return;
  await db
    .update(adminCompaniesTable)
    .set({
      contract_status: "active",
      verification_status: "verified",
      is_blocked: false,
      panel_access_enabled: true,
    })
    .where(eq(adminCompaniesTable.id, companyId));
}

export async function getFleetLoginCompanyDenyReason(
  companyId: string,
): Promise<FleetLoginCompanyDenyReason | null> {
  if (!isPostgresConfigured()) return "company_not_found";
  const db = getDb();
  if (!db) return "company_not_found";
  await reconcileTaxiFreischaltungForFleetLogin(companyId);
  const rows = await db
    .select({
      is_active: adminCompaniesTable.is_active,
      is_blocked: adminCompaniesTable.is_blocked,
      contract_status: adminCompaniesTable.contract_status,
    })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.id, companyId))
    .limit(1);
  const r = rows[0];
  if (!r) return "company_not_found";
  if (!r.is_active) return "company_inactive";
  if (Boolean(r.is_blocked)) return "company_blocked";
  const cs = String(r.contract_status ?? "").trim() || "inactive";
  if (cs !== "active") return "contract_not_active";
  return null;
}

export async function getCompanyGovernanceGate(companyId: string): Promise<CompanyGovernanceGate | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(adminCompaniesTable)
    .where(and(eq(adminCompaniesTable.id, companyId), eq(adminCompaniesTable.is_active, true)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  if (r.panel_access_enabled === false) return null;
  /**
   * Mindest-Stammdaten für Flotten-Freischaltung (Partner/Admin-UI sichtbar):
   * Mandanten-Art, Steuer-ID, Konzessionsnummer, Name, E-Mail, Telefon,
   * Adresse Zeile 1, PLZ, Ort, Land, USt-IdNr.
   */
  const requiredProfileComplete = Boolean(
    String(r.company_kind ?? "").trim() &&
      String(r.tax_id ?? "").trim() &&
      String(r.concession_number ?? "").trim() &&
      String(r.name ?? "").trim() &&
      String(r.email ?? "").trim() &&
      String(r.phone ?? "").trim() &&
      String(r.address_line1 ?? "").trim() &&
      String(r.postal_code ?? "").trim() &&
      String(r.city ?? "").trim() &&
      String(r.country ?? "").trim() &&
      String(r.vat_id ?? "").trim(),
  );
  const complianceStatus = (await getDerivedGlobalComplianceStatusForCompanyRow(
    r,
  )) as string;
  return {
    companyId: r.id,
    companyKind: r.company_kind ?? "general",
    verificationStatus: r.verification_status ?? "pending",
    complianceStatus,
    contractStatus: r.contract_status ?? "inactive",
    isBlocked: Boolean(r.is_blocked),
    hasComplianceGewerbe: Boolean(r.compliance_gewerbe_storage_key),
    hasComplianceInsurance: Boolean(r.compliance_insurance_storage_key),
    maxDrivers: r.max_drivers ?? 100,
    maxVehicles: r.max_vehicles ?? 100,
    requiredProfileComplete,
    farePermissions: (r.fare_permissions as Record<string, unknown> | null) ?? {},
    insurerPermissions: (r.insurer_permissions as Record<string, unknown> | null) ?? {},
    areaAssignments: Array.isArray(r.area_assignments)
      ? r.area_assignments.filter((x): x is string => typeof x === "string")
      : [],
    concessionNumberPresent: Boolean(String(r.concession_number ?? "").trim()),
  };
}

/** Mindestens ein Flotten-Fahrzeug mit Kennzeichen (Onroda-Prüfung, unabhängig von Freigabe-Status). */
export async function companyHasFleetVehicleWithLicensePlate(companyId: string): Promise<boolean> {
  if (!isPostgresConfigured()) return false;
  const db = getDb();
  if (!db) return false;
  const rows = await db
    .select({ plate: fleetVehiclesTable.license_plate })
    .from(fleetVehiclesTable)
    .where(eq(fleetVehiclesTable.company_id, companyId))
    .limit(50);
  return rows.some((r) => Boolean(String(r.plate ?? "").trim()));
}

export async function countFleetDriversForCompany(companyId: string): Promise<number> {
  if (!isPostgresConfigured()) return 0;
  const db = getDb();
  if (!db) return 0;
  const rows = await db
    .select({ n: count() })
    .from(fleetDriversTable)
    .where(eq(fleetDriversTable.company_id, companyId));
  return Number(rows[0]?.n ?? 0);
}

export async function countFleetVehiclesForCompany(companyId: string): Promise<number> {
  if (!isPostgresConfigured()) return 0;
  const db = getDb();
  if (!db) return 0;
  const rows = await db
    .select({ n: count() })
    .from(fleetVehiclesTable)
    .where(eq(fleetVehiclesTable.company_id, companyId));
  return Number(rows[0]?.n ?? 0);
}
