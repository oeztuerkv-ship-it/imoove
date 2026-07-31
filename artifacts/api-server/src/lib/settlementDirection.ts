/** Settlement-Richtung aus Vorzeichen des Unternehmer-Saldos (Phase B). */

export type SettlementPaymentDirection = "platform_pays_partner" | "partner_pays_platform";

export function deriveSettlementDirection(payoutAmount: number): SettlementPaymentDirection {
  const n = Number(payoutAmount);
  if (Number.isFinite(n) && n < -0.004) return "partner_pays_platform";
  return "platform_pays_partner";
}

export function roundSettlementMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
