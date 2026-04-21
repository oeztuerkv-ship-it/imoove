import { and, eq } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { adminCompaniesTable } from "./schema";

/** Mandanten-Typ (Panel / Governance); z. B. Taxi vs. Leistungspartner (Hotel, Kasse, …). */
export type PanelCompanyKind =
  | "general"
  | "taxi"
  | "voucher_client"
  | "insurer"
  | "hotel"
  | "corporate"
  | "medical";

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
  companyKind: PanelCompanyKind;
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
  /** Offizielle Rechnungs-/Stammanschrift (vom Admin gepflegt, im Panel nur Anzeige). */
  billingName: string;
  billingAddressLine1: string;
  billingAddressLine2: string;
  billingPostalCode: string;
  billingCity: string;
  billingCountry: string;
  bankIban: string;
  bankBic: string;
  /** Optional Kostenstelle aus `fare_permissions` (Schlüssel cost_center / costCenter / kostenstelle), sonst leer. */
  costCenter: string;
  verificationStatus: string;
  complianceStatus: string;
  contractStatus: string;
  isBlocked: boolean;
  maxDrivers: number;
  maxVehicles: number;
  /** Basis-Stammdaten im Panel abgeschlossen — Änderungen nur per Change-Request. */
  profileLocked: boolean;
}

export type PanelCompanyProfilePatch = Partial<{
  dispoPhone: string;
  supportEmail: string;
  logoUrl: string;
  openingHours: string;
  /** Nur setzbar, wenn das DB-Feld bisher leer ist (Self-Service bei Ersteinrichtung). */
  name: string;
  contactName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  legalForm: string;
  ownerName: string;
}>;

const MAX = {
  short: 120,
  line: 500,
  url: 2048,
  name: 200,
} as const;

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max);
}

function isDbEmpty(v: string | null | undefined): boolean {
  return !String(v ?? "").trim();
}

/** Gleiche Lückenlogik wie Partner-UI `basicsGaps` — wenn leer, fehlt noch etwas zum Self-Service-Abschluss. */
function partnerBasicsPanelCompleteFromRow(r: typeof adminCompaniesTable.$inferSelect): boolean {
  return (
    !isDbEmpty(r.name) &&
    !isDbEmpty(r.contact_name) &&
    !isDbEmpty(r.email) &&
    !isDbEmpty(r.phone) &&
    !isDbEmpty(r.address_line1) &&
    !isDbEmpty(r.address_line2) &&
    !isDbEmpty(r.postal_code) &&
    !isDbEmpty(r.city) &&
    !isDbEmpty(r.country) &&
    !isDbEmpty(r.legal_form) &&
    !isDbEmpty(r.owner_name)
  );
}

const BASICS_PATCH_KEYS: (keyof PanelCompanyProfilePatch)[] = [
  "name",
  "contactName",
  "email",
  "phone",
  "addressLine1",
  "addressLine2",
  "postalCode",
  "city",
  "country",
  "legalForm",
  "ownerName",
];

function costCenterFromFarePermissions(fp: unknown): string {
  if (!fp || typeof fp !== "object" || Array.isArray(fp)) return "";
  const o = fp as Record<string, unknown>;
  for (const k of ["cost_center", "costCenter", "kostenstelle", "Kostenstelle"]) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
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
      r.company_kind === "corporate" ||
      r.company_kind === "medical"
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
    billingName: r.billing_name ?? "",
    billingAddressLine1: r.billing_address_line1 ?? "",
    billingAddressLine2: r.billing_address_line2 ?? "",
    billingPostalCode: r.billing_postal_code ?? "",
    billingCity: r.billing_city ?? "",
    billingCountry: r.billing_country ?? "",
    bankIban: r.bank_iban ?? "",
    bankBic: r.bank_bic ?? "",
    costCenter: costCenterFromFarePermissions(r.fare_permissions),
    verificationStatus: r.verification_status ?? "pending",
    complianceStatus: r.compliance_status ?? "pending",
    contractStatus: r.contract_status ?? "inactive",
    isBlocked: Boolean(r.is_blocked),
    maxDrivers: r.max_drivers ?? 100,
    maxVehicles: r.max_vehicles ?? 100,
    profileLocked: Boolean(r.partner_panel_profile_locked),
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

  const patchTouchesBasics = keys.some((k) =>
    BASICS_PATCH_KEYS.includes(k as keyof PanelCompanyProfilePatch),
  );
  if (r0.partner_panel_profile_locked && patchTouchesBasics) {
    return { ok: false, error: "partner_basics_locked" };
  }

  const set: Partial<typeof adminCompaniesTable.$inferInsert> = {};

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

  if (patch.name !== undefined && isDbEmpty(r0.name)) {
    const v = clip(patch.name, MAX.name);
    if (v) set.name = v;
  }
  if (patch.contactName !== undefined && isDbEmpty(r0.contact_name)) {
    const v = clip(patch.contactName, MAX.short);
    if (v) set.contact_name = v;
  }
  if (patch.email !== undefined && isDbEmpty(r0.email)) {
    const e = clip(patch.email, MAX.short);
    if (e) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        return { ok: false, error: "email_invalid" };
      }
      set.email = e;
    }
  }
  if (patch.phone !== undefined && isDbEmpty(r0.phone)) {
    const v = clip(patch.phone, MAX.short);
    if (v) set.phone = v;
  }
  if (patch.addressLine1 !== undefined && isDbEmpty(r0.address_line1)) {
    const v = clip(patch.addressLine1, MAX.line);
    if (v) set.address_line1 = v;
  }
  if (patch.addressLine2 !== undefined && isDbEmpty(r0.address_line2)) {
    const v = clip(patch.addressLine2, MAX.line);
    if (v) set.address_line2 = v;
  }
  if (patch.postalCode !== undefined && isDbEmpty(r0.postal_code)) {
    const v = clip(patch.postalCode, MAX.short);
    if (v) set.postal_code = v;
  }
  if (patch.city !== undefined && isDbEmpty(r0.city)) {
    const v = clip(patch.city, MAX.short);
    if (v) set.city = v;
  }
  if (patch.country !== undefined && isDbEmpty(r0.country)) {
    const v = clip(patch.country, MAX.short);
    if (v) set.country = v;
  }
  if (patch.legalForm !== undefined && isDbEmpty(r0.legal_form)) {
    const v = clip(patch.legalForm, MAX.short);
    if (v) set.legal_form = v;
  }
  if (patch.ownerName !== undefined && isDbEmpty(r0.owner_name)) {
    const v = clip(patch.ownerName, MAX.short);
    if (v) set.owner_name = v;
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
  if (!r0.partner_panel_profile_locked && partnerBasicsPanelCompleteFromRow(r1)) {
    await db
      .update(adminCompaniesTable)
      .set({ partner_panel_profile_locked: true })
      .where(eq(adminCompaniesTable.id, companyId));
    const lockedRow = await db.select().from(adminCompaniesTable).where(eq(adminCompaniesTable.id, companyId)).limit(1);
    const r2 = lockedRow[0];
    if (!r2) {
      return { ok: false, error: "company_not_found" };
    }
    return { ok: true, company: rowToPanelPublic(r2) };
  }
  return { ok: true, company: rowToPanelPublic(r1) };
}
