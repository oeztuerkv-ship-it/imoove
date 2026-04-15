import { and, count, eq } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
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
}

/** Nur für Fahrer-Login: Firma ohne `is_active`-Filter laden, klare Fehlercodes statt Sammel-`company_access_blocked`. */
export type FleetLoginCompanyDenyReason =
  | "company_not_found"
  | "company_inactive"
  | "company_blocked"
  | "contract_not_active";

export async function getFleetLoginCompanyDenyReason(
  companyId: string,
): Promise<FleetLoginCompanyDenyReason | null> {
  if (!isPostgresConfigured()) return "company_not_found";
  const db = getDb();
  if (!db) return "company_not_found";
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
  const requiredProfileComplete = Boolean(
    String(r.name ?? "").trim() &&
      String(r.legal_form ?? "").trim() &&
      String(r.owner_name ?? "").trim() &&
      String(r.tax_id ?? "").trim() &&
      String(r.concession_number ?? "").trim() &&
      String(r.address_line1 ?? "").trim() &&
      String(r.postal_code ?? "").trim() &&
      String(r.city ?? "").trim() &&
      String(r.country ?? "").trim() &&
      String(r.billing_name ?? "").trim() &&
      String(r.billing_address_line1 ?? "").trim() &&
      String(r.billing_postal_code ?? "").trim() &&
      String(r.billing_city ?? "").trim() &&
      String(r.billing_country ?? "").trim(),
  );
  return {
    companyId: r.id,
    companyKind: r.company_kind ?? "general",
    verificationStatus: r.verification_status ?? "pending",
    complianceStatus: r.compliance_status ?? "pending",
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
  };
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
