import type { CompanyRow } from "../routes/adminApi.types";
import type { FinancePricingContext } from "./financeCalculationService";

export type CompanyCommissionType = "percentage" | "fixed" | "hybrid" | "none";

export function normalizeCompanyCommissionType(raw: unknown): CompanyCommissionType {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "fixed" || v === "hybrid" || v === "none") return v;
  return "percentage";
}

/** Finance-Kontext aus Mandanten-Stammdaten (Priorität vor rein operativer Default-Rate). */
export function financePricingContextFromCompanyRow(
  company: Pick<
    CompanyRow,
    "commission_type" | "commission_rate" | "commission_fixed_eur" | "min_commission_eur" | "payout_allowed"
  >,
  opFallback?: Pick<FinancePricingContext, "minCommissionEur" | "vatRate">,
): FinancePricingContext {
  const type = normalizeCompanyCommissionType(
    (company as CompanyRow & { commission_type?: string }).commission_type,
  );
  if (type === "none") {
    return {
      commissionType: "none",
      commissionValue: 0,
      minCommissionEur: null,
      vatRate: opFallback?.vatRate,
    };
  }
  if (type === "fixed") {
    const fixed = Number((company as CompanyRow & { commission_fixed_eur?: number }).commission_fixed_eur ?? 0);
    return {
      commissionType: "fixed",
      commissionValue: Number.isFinite(fixed) && fixed >= 0 ? fixed : 0,
      minCommissionEur: null,
      vatRate: opFallback?.vatRate,
    };
  }
  const rate =
    typeof company.commission_rate === "number" && Number.isFinite(company.commission_rate)
      ? Math.min(1, Math.max(0, company.commission_rate))
      : 0.1;
  const minRaw = (company as CompanyRow & { min_commission_eur?: number | null }).min_commission_eur;
  const minCommissionEur =
    typeof minRaw === "number" && Number.isFinite(minRaw) && minRaw > 0
      ? minRaw
      : opFallback?.minCommissionEur ?? null;
  return {
    commissionType: type === "hybrid" ? "percentage" : "percentage",
    commissionValue: rate,
    minCommissionEur,
    vatRate: opFallback?.vatRate,
  };
}
