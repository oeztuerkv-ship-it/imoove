import { and, eq } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { adminCompaniesTable } from "./schema";

/** Öffentliche Firmendaten fürs Partner-Panel (keine internen PRIO-Steuerfelder). */
export interface PanelCompanyPublic {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  vatId: string;
  isActive: boolean;
  /** Mandanten-Typ: Governance steuert Module, Preise, Flows. */
  companyKind: "general" | "taxi" | "voucher_client" | "insurer" | "hotel" | "corporate";
  taxId: string;
  concessionNumber: string;
  hasComplianceGewerbe: boolean;
  hasComplianceInsurance: boolean;
  legalForm: string;
  ownerName: string;
  supportEmail: string;
  dispoPhone: string;
  logoUrl: string;
  openingHours: string;
  businessNotes: string;
  verificationStatus: string;
  complianceStatus: string;
  contractStatus: string;
  isBlocked: boolean;
  maxDrivers: number;
  maxVehicles: number;
}

export type PanelCompanyProfilePatch = Partial<{
  contactName: string;
  dispoPhone: string;
  supportEmail: string;
  logoUrl: string;
  openingHours: string;
  businessNotes: string;
}>;

const MAX = {
  short: 120,
  line: 500,
  url: 2048,
} as const;

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max);
}

function rowToPanelPublic(r: typeof adminCompaniesTable.$inferSelect): PanelCompanyPublic {
  return {
    id: r.id,
    name: r.name,
    contactName: r.contact_name,
    email: r.email,
    phone: r.phone,
    addressLine1: r.address_line1,
    addressLine2: r.address_line2,
    postalCode: r.postal_code,
    city: r.city,
    country: r.country,
    vatId: r.vat_id,
    isActive: r.is_active,
    companyKind:
      r.company_kind === "taxi" ||
      r.company_kind === "voucher_client" ||
      r.company_kind === "insurer" ||
      r.company_kind === "hotel" ||
      r.company_kind === "corporate"
        ? r.company_kind
        : "general",
    taxId: r.tax_id ?? "",
    concessionNumber: r.concession_number ?? "",
    hasComplianceGewerbe: Boolean(r.compliance_gewerbe_storage_key),
    hasComplianceInsurance: Boolean(r.compliance_insurance_storage_key),
    legalForm: r.legal_form ?? "",
    ownerName: r.owner_name ?? "",
    supportEmail: r.support_email ?? "",
    dispoPhone: r.dispo_phone ?? "",
    logoUrl: r.logo_url ?? "",
    openingHours: r.opening_hours ?? "",
    businessNotes: r.business_notes ?? "",
    verificationStatus: r.verification_status ?? "pending",
    complianceStatus: r.compliance_status ?? "pending",
    contractStatus: r.contract_status ?? "inactive",
    isBlocked: Boolean(r.is_blocked),
    maxDrivers: r.max_drivers ?? 100,
    maxVehicles: r.max_vehicles ?? 100,
  };
}

export async function getPanelCompanyById(companyId: string): Promise<PanelCompanyPublic | null> {
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
  return rowToPanelPublic(r);
}

/**
 * Partner darf nur operative Kontaktdaten pflegen.
 * Kritische Stamm-/Vertrags-/Compliance-Felder laufen über company_change_requests.
 */
export async function patchPanelCompanyProfile(
  companyId: string,
  patch: PanelCompanyProfilePatch,
): Promise<{ ok: true; company: PanelCompanyPublic } | { ok: false; error: string }> {
  if (!isPostgresConfigured()) {
    return { ok: false, error: "database_not_configured" };
  }
  const db = getDb();
  if (!db) {
    return { ok: false, error: "database_not_configured" };
  }

  const rows = await db.select().from(adminCompaniesTable).where(eq(adminCompaniesTable.id, companyId)).limit(1);
  const r0 = rows[0];
  if (!r0 || !r0.is_active) {
    return { ok: false, error: "company_not_found" };
  }

  const keys = Object.keys(patch).filter((k) => patch[k as keyof PanelCompanyProfilePatch] !== undefined);
  if (keys.length === 0) {
    return { ok: false, error: "no_changes" };
  }

  const set: Partial<typeof adminCompaniesTable.$inferInsert> = {};

  if (patch.contactName !== undefined) {
    set.contact_name = clip(patch.contactName, MAX.short);
  }
  if (patch.supportEmail !== undefined) {
    const e = clip(patch.supportEmail, MAX.short);
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      return { ok: false, error: "email_invalid" };
    }
    set.support_email = e;
  }
  if (patch.dispoPhone !== undefined) {
    set.dispo_phone = clip(patch.dispoPhone, MAX.short);
  }
  if (patch.logoUrl !== undefined) {
    set.logo_url = clip(patch.logoUrl, MAX.url);
  }
  if (patch.openingHours !== undefined) {
    set.opening_hours = clip(patch.openingHours, MAX.line);
  }
  if (patch.businessNotes !== undefined) {
    set.business_notes = clip(patch.businessNotes, MAX.line);
  }

  if (Object.keys(set).length === 0) {
    return { ok: false, error: "no_changes" };
  }

  await db.update(adminCompaniesTable).set(set).where(eq(adminCompaniesTable.id, companyId));

  const again = await db.select().from(adminCompaniesTable).where(eq(adminCompaniesTable.id, companyId)).limit(1);
  const r1 = again[0];
  if (!r1) {
    return { ok: false, error: "company_not_found" };
  }
  return { ok: true, company: rowToPanelPublic(r1) };
}
