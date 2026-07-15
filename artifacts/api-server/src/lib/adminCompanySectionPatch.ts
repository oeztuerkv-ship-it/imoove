import { forbiddenPanelModulesForCompanyKind } from "../domain/adminCompanyKindPanelModules";
import type { AdminCompanyUpdateBody } from "../db/adminData";
import { findCompanyById, updateAdminCompany } from "../db/adminData";
import { patchCompanyOnboardingStatus } from "../db/companyOnboardingData";
import { logger } from "./logger";
import type { CompanyRow } from "../routes/adminApi.types";
import {
  bodyTouchesSection,
  logAdminCompanySectionPatch,
  type AdminCompanyPatchSection,
} from "./adminCompanyPatchAudit";
import { validateAdminCompanyPatchBody, type AdminCompanyFieldErrors } from "./adminCompanyPatchValidate";
import { syncCompanyBillingAccountFields } from "../db/adminCompanyBillingSync";

const FP_BLOCK = "admin_platform_block_reason";

function sectionBody(
  section: AdminCompanyPatchSection,
  raw: Record<string, unknown>,
): AdminCompanyUpdateBody & Record<string, unknown> {
  const out: AdminCompanyUpdateBody & Record<string, unknown> = {};
  const allow = new Set([
    ...(section === "stammdaten"
      ? [
          "name",
          "legal_form",
          "owner_name",
          "tax_id",
          "vat_id",
          "concession_number",
          "trade_license_number",
          "company_code",
          "invoice_prefix",
          "company_kind",
        ]
      : []),
    ...(section === "kontakt"
      ? [
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
        ]
      : []),
    ...(section === "status"
      ? [
          "is_active",
          "is_blocked",
          "verification_status",
          "compliance_status",
          "contract_status",
          "medical_transport_enabled",
          "feature_kk_module",
          "max_drivers",
          "max_vehicles",
          "panel_modules",
          "panel_access_enabled",
          "onboarding_status",
        ]
      : []),
    ...(section === "billing"
      ? [
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
        ]
      : []),
    ...(section === "bank" ? ["bank_iban", "bank_bic"] : []),
    ...(section === "notes" ? ["business_notes"] : []),
  ]);
  for (const [k, v] of Object.entries(raw)) {
    if (k === "block_platform_reason" && section === "status") {
      out.block_platform_reason = v;
      continue;
    }
    if (allow.has(k)) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

function applyBlockReasonToFarePermissions(
  cur: CompanyRow,
  reason: string | undefined,
): AdminCompanyUpdateBody {
  if (reason === undefined) return {};
  const fp = { ...(cur.fare_permissions || {}) };
  const t = String(reason).trim();
  if (t) fp[FP_BLOCK] = t;
  else delete fp[FP_BLOCK];
  return { fare_permissions: fp };
}

export type AdminCompanySectionPatchResult =
  | { ok: true; item: CompanyRow; billingAccountEmail: string | null; billingSettlementInterval: string | null; billingPaymentTermsDays: number | null }
  | { ok: false; error: string; fieldErrors?: AdminCompanyFieldErrors };

export async function patchAdminCompanySection(
  companyId: string,
  section: AdminCompanyPatchSection,
  raw: Record<string, unknown>,
  adminUserId: string | null,
  opts?: { approvedBy?: string | null },
): Promise<AdminCompanySectionPatchResult> {
  const before = await findCompanyById(companyId);
  if (!before) return { ok: false, error: "not_found" };

  let body = sectionBody(section, raw);
  if (section === "status" && "block_platform_reason" in raw) {
    body = { ...body, ...applyBlockReasonToFarePermissions(before, raw.block_platform_reason as string | undefined) };
  }
  const hasBlockReason = section === "status" && Object.prototype.hasOwnProperty.call(raw, "block_platform_reason");
  if (!bodyTouchesSection(body, section) && !hasBlockReason) {
    return { ok: false, error: "empty_patch" };
  }

  const fieldErrors = validateAdminCompanyPatchBody(body);
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "validation_failed", fieldErrors };
  }

  if (section === "status" && Array.isArray(body.panel_modules) && body.panel_modules.length > 0) {
    const bad = forbiddenPanelModulesForCompanyKind(before.company_kind, body.panel_modules);
    if (bad.length > 0) {
      return {
        ok: false,
        error: "panel_modules_forbidden_for_company_kind",
        fieldErrors: {
          panel_modules: `Für Mandanten-Typ „${before.company_kind}“ nicht erlaubt: ${bad.join(", ")}`,
        },
      };
    }
  }

  const billingExtra = {
    billing_account_email:
      typeof body.billing_account_email === "string" ? body.billing_account_email : undefined,
    billing_settlement_interval:
      typeof (body as { billing_settlement_interval?: string }).billing_settlement_interval === "string"
        ? (body as { billing_settlement_interval: string }).billing_settlement_interval
        : undefined,
    billing_payment_terms_days:
      typeof (body as { billing_payment_terms_days?: number }).billing_payment_terms_days === "number"
        ? (body as { billing_payment_terms_days: number }).billing_payment_terms_days
        : undefined,
  };

  const patchBody: AdminCompanyUpdateBody = { ...body };
  delete (patchBody as Record<string, unknown>).billing_settlement_interval;
  delete (patchBody as Record<string, unknown>).billing_payment_terms_days;
  delete (patchBody as Record<string, unknown>).block_platform_reason;

  let after = await updateAdminCompany(companyId, patchBody);
  if (!after) return { ok: false, error: "not_found" };

  if (
    section === "status" &&
    typeof patchBody.onboarding_status === "string" &&
    patchBody.onboarding_status === "approved" &&
    before.onboarding_status !== "approved"
  ) {
    const ob = await patchCompanyOnboardingStatus(companyId, {
      status: "approved",
      approvedBy: opts?.approvedBy ?? undefined,
    });
    if (ob.ok) {
      after = await findCompanyById(companyId);
      if (!after) return { ok: false, error: "not_found" };
    }
  }

  let billingAccountEmail: string | null = null;
  let billingSettlementInterval: string | null = null;
  let billingPaymentTermsDays: number | null = null;
  if (section === "billing") {
    const synced = await syncCompanyBillingAccountFields(companyId, billingExtra);
    billingAccountEmail = synced.billingEmail;
    billingSettlementInterval = synced.settlementInterval;
    billingPaymentTermsDays = synced.paymentTermsDays;
  }

  try {
    await logAdminCompanySectionPatch(companyId, section, before, after, adminUserId, {
      billing_account_email: billingAccountEmail,
      billing_settlement_interval: billingSettlementInterval,
      billing_payment_terms_days: billingPaymentTermsDays,
    });
  } catch (err) {
    logger.warn({ err, companyId, section }, "admin company section patch: audit log failed (data saved)");
  }

  return {
    ok: true,
    item: after,
    billingAccountEmail,
    billingSettlementInterval,
    billingPaymentTermsDays,
  };
}
