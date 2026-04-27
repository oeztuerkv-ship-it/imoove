import type { RideRequest } from "../domain/rideRequest";

export type FinancePayerType =
  | "passenger"
  | "hotel"
  | "company"
  | "insurance"
  | "voucher"
  | "third_party";

export type FinanceBillingMode = "direct" | "invoice" | "voucher" | "insurance" | "manual";
export type FinanceCommissionType = "percentage" | "fixed" | "hybrid" | "none";

export type RideFinancialBillingStatus =
  | "unbilled"
  | "queued"
  | "invoiced"
  | "partially_paid"
  | "paid"
  | "cancelled"
  | "written_off";

export type RideFinancialSettlementStatus =
  | "open"
  | "calculated"
  | "approved"
  | "paid_out"
  | "held"
  | "disputed";

export interface FinancePricingContext {
  vatRate?: number | null;
  commissionType?: FinanceCommissionType | null;
  commissionValue?: number | null;
  /** Mindest-Provision in EUR (Plattform-Konfig), nach %-Berechnung. */
  minCommissionEur?: number | null;
}

export interface FinanceCalculationInput {
  ride: RideRequest;
  pricingContext?: FinancePricingContext | null;
  partnerCompanyId?: string | null;
  serviceProviderCompanyId?: string | null;
}

export interface FinanceCalculationResult {
  grossAmount: number;
  netAmount: number;
  vatRate: number;
  vatAmount: number;
  payerType: FinancePayerType;
  billingMode: FinanceBillingMode;
  partnerCompanyId: string | null;
  serviceProviderCompanyId: string | null;
  commissionType: FinanceCommissionType;
  commissionValue: number;
  commissionAmount: number;
  operatorPayoutAmount: number;
  calculationVersion: string;
  calculationRuleSet: string | null;
  calculationMetadata: Record<string, unknown>;
}

const DEFAULT_VAT_RATE = 0.19;
const DEFAULT_COMMISSION_VALUE = 0.15;
const DEFAULT_CALCULATION_VERSION = "finance_v1";
const DEFAULT_RULE_SET = "onroda.finance.v1.default";

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toSafeNonNegative(value: number | null | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, value);
}

function derivePayerType(ride: RideRequest): FinancePayerType {
  if (ride.partnerBookingMeta?.flow === "hotel_guest") return "hotel";
  if (ride.payerKind === "insurance") return "insurance";
  if (ride.payerKind === "voucher") return "voucher";
  if (ride.payerKind === "third_party") return "third_party";
  if (ride.payerKind === "company") return "company";
  return "passenger";
}

function deriveBillingMode(ride: RideRequest): FinanceBillingMode {
  if (ride.authorizationSource === "access_code") return "voucher";
  if (ride.payerKind === "insurance") return "insurance";
  if (ride.payerKind === "company") return "invoice";
  if (ride.payerKind === "voucher") return "voucher";
  return "direct";
}

function deriveInitialBillingStatus(ride: RideRequest): RideFinancialBillingStatus {
  if (ride.status === "cancelled" || ride.status === "cancelled_by_customer" || ride.status === "cancelled_by_driver") {
    return "cancelled";
  }
  return "unbilled";
}

function deriveInitialSettlementStatus(ride: RideRequest): RideFinancialSettlementStatus {
  if (ride.status === "cancelled" || ride.status === "cancelled_by_customer" || ride.status === "cancelled_by_driver") {
    return "held";
  }
  return "open";
}

export function calculateRideFinancialsV1(input: FinanceCalculationInput): FinanceCalculationResult {
  const { ride } = input;
  const pricingContext = input.pricingContext ?? null;

  const grossAmount = roundMoney(
    toSafeNonNegative(
      Number.isFinite(Number(ride.finalFare)) ? Number(ride.finalFare) : Number(ride.estimatedFare),
      0,
    ),
  );

  const vatRate = toSafeNonNegative(pricingContext?.vatRate ?? DEFAULT_VAT_RATE, DEFAULT_VAT_RATE);
  const netAmount = roundMoney(grossAmount / (1 + vatRate));
  const vatAmount = roundMoney(grossAmount - netAmount);

  const commissionType = pricingContext?.commissionType ?? "percentage";
  const commissionValue = toSafeNonNegative(
    pricingContext?.commissionValue ?? DEFAULT_COMMISSION_VALUE,
    DEFAULT_COMMISSION_VALUE,
  );
  let commissionAmount =
    commissionType === "fixed"
      ? roundMoney(commissionValue)
      : commissionType === "none"
        ? 0
        : roundMoney(grossAmount * commissionValue);
  const minComm = pricingContext?.minCommissionEur;
  if (typeof minComm === "number" && Number.isFinite(minComm) && minComm > 0 && commissionType !== "none") {
    commissionAmount = roundMoney(Math.max(commissionAmount, minComm));
  }
  commissionAmount = roundMoney(Math.min(commissionAmount, grossAmount));
  const operatorPayoutAmount = roundMoney(Math.max(0, grossAmount - commissionAmount));

  return {
    grossAmount,
    netAmount,
    vatRate,
    vatAmount,
    payerType: derivePayerType(ride),
    billingMode: deriveBillingMode(ride),
    partnerCompanyId: input.partnerCompanyId ?? ride.companyId ?? null,
    serviceProviderCompanyId: input.serviceProviderCompanyId ?? ride.companyId ?? null,
    commissionType,
    commissionValue,
    commissionAmount,
    operatorPayoutAmount,
    calculationVersion: DEFAULT_CALCULATION_VERSION,
    calculationRuleSet: DEFAULT_RULE_SET,
    calculationMetadata: {
      rideStatus: ride.status,
      pricingMode: ride.pricingMode ?? "taxi_tariff",
      rideKind: ride.rideKind,
      payerKind: ride.payerKind,
      initialBillingStatus: deriveInitialBillingStatus(ride),
      initialSettlementStatus: deriveInitialSettlementStatus(ride),
    },
  };
}

export function deriveFinanceInitialStatuses(ride: RideRequest): {
  billingStatus: RideFinancialBillingStatus;
  settlementStatus: RideFinancialSettlementStatus;
} {
  return {
    billingStatus: deriveInitialBillingStatus(ride),
    settlementStatus: deriveInitialSettlementStatus(ride),
  };
}
