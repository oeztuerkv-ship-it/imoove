import { randomUUID } from "node:crypto";
import { isPostgresConfigured } from "../db/client";
import { insertPanelAuditLog } from "../db/panelAuditData";
import type { AdminCompanyUpdateBody } from "../db/adminData";
import type { CompanyRow } from "../routes/adminApi.types";

export type AdminCompanyPatchSection =
  | "stammdaten"
  | "kontakt"
  | "status"
  | "billing"
  | "bank"
  | "notes";

const SECTION_KEYS: Record<AdminCompanyPatchSection, (keyof CompanyRow | "billing_account_email")[]> = {
  stammdaten: [
    "name",
    "legal_form",
    "owner_name",
    "tax_id",
    "vat_id",
    "concession_number",
    "trade_license_number",
    "company_code",
    "invoice_prefix",
  ],
  kontakt: [
    "contact_name",
    "email",
    "phone",
    "support_email",
    "dispo_phone",
    "address_line1",
    "address_line2",
    "postal_code",
    "city",
    "country",
    "opening_hours",
  ],
  status: [
    "is_active",
    "is_blocked",
    "verification_status",
    "compliance_status",
    "contract_status",
    "medical_transport_enabled",
    "feature_kk_module",
    "max_drivers",
    "max_vehicles",
    "fare_permissions",
    "panel_modules",
    "panel_access_enabled",
    "onboarding_status",
  ],
  billing: [
    "billing_name",
    "billing_address_line1",
    "billing_address_line2",
    "billing_postal_code",
    "billing_city",
    "billing_country",
    "commission_rate",
    "commission_type",
    "commission_fixed_eur",
    "min_commission_eur",
    "payout_allowed",
    "partner_ik_number",
    "insurer_billing_contacts_json",
    "billing_account_email",
    "billing_settlement_interval",
    "billing_payment_terms_days",
  ],
  bank: ["bank_iban", "bank_bic"],
  notes: ["business_notes"],
};

function pickSnapshot(
  row: CompanyRow | null,
  extra: Record<string, unknown> | null,
  keys: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k === "billing_account_email") {
      out[k] = extra?.billing_account_email ?? null;
      continue;
    }
    if (k === "billing_settlement_interval") {
      out[k] = extra?.billing_settlement_interval ?? null;
      continue;
    }
    if (k === "billing_payment_terms_days") {
      out[k] = extra?.billing_payment_terms_days ?? null;
      continue;
    }
    if (!row) continue;
    if (k in row) out[k] = (row as Record<string, unknown>)[k];
  }
  return out;
}

export async function logAdminCompanySectionPatch(
  companyId: string,
  section: AdminCompanyPatchSection,
  before: CompanyRow,
  after: CompanyRow,
  adminUserId: string | null,
  extra?: {
    billing_account_email?: string | null;
    billing_settlement_interval?: string | null;
    billing_payment_terms_days?: number | null;
  },
): Promise<void> {
  if (!isPostgresConfigured()) return;
  const keys = SECTION_KEYS[section];
  await insertPanelAuditLog({
    id: randomUUID(),
    companyId,
    actorPanelUserId: null,
    action: `admin.company.patch.${section}`,
    subjectType: "company",
    subjectId: companyId,
    meta: {
      section,
      adminUserId,
      before: pickSnapshot(before, extra ?? null, keys as string[]),
      after: pickSnapshot(after, extra ?? null, keys as string[]),
    },
  });
}

export function bodyTouchesSection(body: AdminCompanyUpdateBody, section: AdminCompanyPatchSection): boolean {
  const keys = SECTION_KEYS[section];
  return keys.some((k) => Object.prototype.hasOwnProperty.call(body, k));
}
