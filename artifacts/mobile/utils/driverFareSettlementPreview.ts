/** Rundet Geldbeträge auf 2 Nachkommastellen (EUR). */
export function roundMoneyEur(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type DriverFareSettlementPreview = {
  grossEur: number;
  commissionEur: number;
  payoutEur: number;
  commissionRatePercent: number;
};

/**
 * Fahrer-Vorschau im Abschluss-Dialog (gleiche Formel wie API finance_v1).
 * @param commissionRate Dezimal (0.10 = 10 %)
 */
export function computeDriverFareSettlementPreview(
  grossEur: number,
  commissionRate: number,
  minCommissionEur?: number | null,
): DriverFareSettlementPreview {
  const gross = roundMoneyEur(Math.max(0, grossEur));
  const rate = Number.isFinite(commissionRate) && commissionRate >= 0 ? commissionRate : 0.1;
  let commission = roundMoneyEur(gross * rate);
  if (typeof minCommissionEur === "number" && Number.isFinite(minCommissionEur) && minCommissionEur > 0) {
    commission = roundMoneyEur(Math.max(commission, minCommissionEur));
  }
  commission = roundMoneyEur(Math.min(commission, gross));
  const payout = roundMoneyEur(Math.max(0, gross - commission));
  return {
    grossEur: gross,
    commissionEur: commission,
    payoutEur: payout,
    commissionRatePercent: Math.round(rate * 1000) / 10,
  };
}
