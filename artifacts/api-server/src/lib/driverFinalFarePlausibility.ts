/**
 * Plausibilität Taxameter-Endpreis vs. Buchungsschätzung (Taxi).
 * Blockiert extreme Ausreißer; Bestätigung per finalFarePlausibilityAck erlaubt Fortführung + Audit.
 */
export type FinalFarePlausibilityResult =
  | { ok: true; flagged: boolean; maxAllowedEur: number }
  | { ok: false; maxAllowedEur: number; ratio: number };

const MIN_ESTIMATE_FOR_CHECK_EUR = 8;
const RATIO_CAP = 2.5;
const ABS_SURCHARGE_CAP_EUR = 40;

export function maxAllowedFinalFareEur(estimatedFare: number): number {
  const est = Number(estimatedFare);
  if (!Number.isFinite(est) || est <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(est * RATIO_CAP, est + ABS_SURCHARGE_CAP_EUR);
}

export function evaluateFinalFarePlausibility(
  estimatedFare: number,
  finalFare: number,
): FinalFarePlausibilityResult {
  const est = Number(estimatedFare);
  const fin = Number(finalFare);
  if (!Number.isFinite(fin) || fin < 0) {
    return { ok: false, maxAllowedEur: 0, ratio: 0 };
  }
  if (!Number.isFinite(est) || est < MIN_ESTIMATE_FOR_CHECK_EUR) {
    return { ok: true, flagged: false, maxAllowedEur: Number.POSITIVE_INFINITY };
  }
  const maxAllowed = maxAllowedFinalFareEur(est);
  if (fin <= maxAllowed + 1e-9) {
    const flagged = fin > est * 1.75 + 1e-9;
    return { ok: true, flagged, maxAllowedEur: maxAllowed };
  }
  return { ok: false, maxAllowedEur: maxAllowed, ratio: fin / est };
}
