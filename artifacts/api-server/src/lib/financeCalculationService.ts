import type { RideRequest } from "../domain/rideRequest";
import { isCashPaymentMethod } from "./ridePaymentMethod";

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
const DEFAULT_RULE_SET = "onroda.finance.v1.cash_card_netting";

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toSafeNonNegative(value: number | null | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, value);
}

/** Buchungs-snapshot: gültiger Bruttobetrag, wenn `finalPriceEur` gesetzt. */
function readTariffSnapshotGrossEur(ride: RideRequest): number | null {
  const snap = ride.tariffSnapshot;
  if (snap == null || typeof snap !== "object") return null;
  const v = Number((snap as { finalPriceEur?: unknown }).finalPriceEur);
  if (!Number.isFinite(v) || v < 0) return null;
  return roundMoney(v);
}

function isCompletedTaxiRide(ride: RideRequest): boolean {
  if (ride.status !== "completed") return false;
  const mode = ride.pricingMode ?? "taxi_tariff";
  return mode === "taxi_tariff" || mode === "hybrid" || mode == null;
}

const FEE_TERMINAL_STATUSES = new Set([
  "cancelled",
  "cancelled_by_customer",
  "cancelled_by_driver",
  "no_show",
]);

/** Storno/No-Show mit gesetzter Gebühr (`finalFare`) — nicht Schätzpreis. */
export function isBillableCancelOrNoShow(ride: Pick<RideRequest, "status" | "finalFare">): boolean {
  if (!FEE_TERMINAL_STATUSES.has(String(ride.status ?? ""))) return false;
  const fee = ride.finalFare;
  return fee != null && Number.isFinite(Number(fee)) && Number(fee) > 0;
}

/**
 * Bruttobetrag für Finance:
 * - Abgeschlossene Taxi-Fahrt: Taxameter-`finalFare`.
 * - Storno/No-Show mit Gebühr: `finalFare` (Fee), nie `tariffSnapshot`.
 * - Sonst Buchungs-`tariffSnapshot.finalPriceEur` oder Legacy-Schätzung.
 */
export function effectiveTaxiGrossEur(ride: RideRequest): number {
  const finalFare = ride.finalFare;
  if (
    isCompletedTaxiRide(ride) &&
    finalFare != null &&
    Number.isFinite(Number(finalFare))
  ) {
    return roundMoney(Math.max(0, Number(finalFare)));
  }
  if (isBillableCancelOrNoShow(ride)) {
    return roundMoney(Math.max(0, Number(finalFare)));
  }
  const fromSnap = readTariffSnapshotGrossEur(ride);
  if (fromSnap !== null) return fromSnap;
  return roundMoney(
    toSafeNonNegative(
      Number.isFinite(Number(finalFare)) ? Number(finalFare) : Number(ride.estimatedFare),
      0,
    ),
  );
}

function resolveGrossSource(ride: RideRequest, usedSnapshot: boolean): string {
  if (
    isCompletedTaxiRide(ride) &&
    ride.finalFare != null &&
    Number.isFinite(Number(ride.finalFare))
  ) {
    return "taxameter_final_fare";
  }
  if (isBillableCancelOrNoShow(ride)) {
    return ride.status === "no_show" ? "no_show_fee" : "cancel_fee";
  }
  if (usedSnapshot) return "tariff_snapshot";
  return "legacy_final_or_estimate";
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
  if (isBillableCancelOrNoShow(ride)) return "unbilled";
  if (
    ride.status === "cancelled" ||
    ride.status === "cancelled_by_customer" ||
    ride.status === "cancelled_by_driver" ||
    ride.status === "no_show"
  ) {
    return "cancelled";
  }
  return "unbilled";
}

function deriveInitialSettlementStatus(ride: RideRequest): RideFinancialSettlementStatus {
  if (isBillableCancelOrNoShow(ride)) return "open";
  if (
    ride.status === "cancelled" ||
    ride.status === "cancelled_by_customer" ||
    ride.status === "cancelled_by_driver" ||
    ride.status === "no_show"
  ) {
    return "held";
  }
  return "open";
}

/**
 * Unternehmer-Netto je Fahrt:
 * - Karte/Wallet: positiv (gross − commission) — Plattform zahlt an Unternehmen aus
 * - Bar: negativ (−commission) — Unternehmen hat Brutto schon kassiert, schuldet Provision
 */
export function computeOperatorPayoutAmount(input: {
  grossAmount: number;
  commissionAmount: number;
  paymentMethod?: string | null;
}): number {
  const commission = roundMoney(Math.max(0, input.commissionAmount));
  if (isCashPaymentMethod(input.paymentMethod)) {
    return roundMoney(-commission);
  }
  const gross = roundMoney(Math.max(0, input.grossAmount));
  return roundMoney(Math.max(0, gross - commission));
}

export function calculateRideFinancialsV1(input: FinanceCalculationInput): FinanceCalculationResult {
  const { ride } = input;
  const pricingContext = input.pricingContext ?? null;

  const grossAmount = effectiveTaxiGrossEur(ride);
  const grossFromSnapshot =
    !isCompletedTaxiRide(ride) &&
    !isBillableCancelOrNoShow(ride) &&
    (ride.finalFare == null || !Number.isFinite(Number(ride.finalFare)))
      ? readTariffSnapshotGrossEur(ride) !== null
      : false;

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
  const cashRide = isCashPaymentMethod(ride.paymentMethod);
  const operatorPayoutAmount = computeOperatorPayoutAmount({
    grossAmount,
    commissionAmount,
    paymentMethod: ride.paymentMethod,
  });

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
      paymentMethod: ride.paymentMethod ?? "",
      cashRide,
      payoutModel: cashRide ? "cash_negative_commission" : "card_gross_minus_commission",
      initialBillingStatus: deriveInitialBillingStatus(ride),
      initialSettlementStatus: deriveInitialSettlementStatus(ride),
      grossSource: resolveGrossSource(ride, grossFromSnapshot),
      ...(ride.tariffSnapshot && typeof ride.tariffSnapshot === "object"
        ? { tariffSnapshot: ride.tariffSnapshot }
        : {}),
    },
  };
}

export function previewDriverSettlementFromGross(
  grossEur: number,
  pricingContext: FinancePricingContext,
): {
  grossAmount: number;
  commissionRate: number;
  commissionRatePercent: number;
  commissionAmount: number;
  driverPayoutAmount: number;
} {
  const grossSafe = toSafeNonNegative(grossEur, 0);
  /** Preview ohne Bar → Karten-Logik (positiver Unternehmer-/Fahrer-Anteil). */
  const ride = {
    id: "preview",
    status: "completed",
    finalFare: grossSafe,
    estimatedFare: grossSafe,
    rideKind: "standard",
    payerKind: "passenger",
    pricingMode: "taxi_tariff",
    paymentMethod: "card",
  } as RideRequest;
  const calc = calculateRideFinancialsV1({ ride, pricingContext });
  const rate = calc.commissionValue;
  return {
    grossAmount: calc.grossAmount,
    commissionRate: rate,
    commissionRatePercent: Math.round(rate * 1000) / 10,
    commissionAmount: calc.commissionAmount,
    driverPayoutAmount: calc.operatorPayoutAmount,
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
