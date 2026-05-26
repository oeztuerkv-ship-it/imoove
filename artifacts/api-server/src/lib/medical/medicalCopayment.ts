/**
 * Gesetzliche Zuzahlung Krankenfahrt (10 %, min. 5 €, max. 10 €) — Schätzung für Scan-Response.
 * Keine Zahlungsgarantie; endgültige Höhe abhängig von tatsächlichen Fahrtkosten.
 */

export type MedicalScanCopaymentDto = {
  /** Ob Zuzahlung grundsätzlich zu erwarten ist (GKV-Krankenfahrt). */
  required: "yes" | "no" | "unknown";
  /** Berechneter Eigenanteil in EUR; null ohne Fahrpreis-Schätzung. */
  amountEstimated: number | null;
  /** Untergrenze der gesetzlichen Zuzahlung (EUR). */
  amountMinEur: number;
  /** Obergrenze der gesetzlichen Zuzahlung (EUR). */
  amountMaxEur: number;
  /** Kurzregel für UI. */
  ruleDe: string;
  /** Vom Client gemeldete Befreiung (z. B. Checkbox). */
  exemptDeclared: boolean;
  /** Hinweistext für Kunde/Fahrer. */
  noteDe: string;
};

const COPAYMENT_MIN_EUR = 5;
const COPAYMENT_MAX_EUR = 10;
const COPAYMENT_PERCENT = 0.1;

export const MEDICAL_COPAYMENT_RULE_DE =
  "10 % der Fahrtkosten, mindestens 5 €, höchstens 10 € (bei Befreiung 0 €)";

/** Entspricht Mobile `calculateCopayment` in RideContext. */
export function calculateMedicalCopaymentEur(fullFare: number, isExempted: boolean): number {
  if (isExempted) return 0;
  if (!Number.isFinite(fullFare) || fullFare < 0) return 0;
  let copayment = fullFare * COPAYMENT_PERCENT;
  if (copayment < COPAYMENT_MIN_EUR) {
    copayment = COPAYMENT_MIN_EUR;
  } else if (copayment > COPAYMENT_MAX_EUR) {
    copayment = COPAYMENT_MAX_EUR;
  }
  if (fullFare < COPAYMENT_MIN_EUR) {
    copayment = fullFare;
  }
  return Math.round(copayment * 100) / 100;
}

export function parseMedicalScanCopaymentInput(raw: unknown): {
  estimatedFare: number | null;
  copaymentExempt: boolean;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { estimatedFare: null, copaymentExempt: false };
  }
  const body = raw as Record<string, unknown>;
  const fareRaw = body.estimatedFare ?? body.estimated_fare;
  let estimatedFare: number | null = null;
  if (typeof fareRaw === "number" && Number.isFinite(fareRaw) && fareRaw >= 0) {
    estimatedFare = fareRaw;
  } else if (typeof fareRaw === "string" && fareRaw.trim()) {
    const n = Number(fareRaw.replace(",", "."));
    if (Number.isFinite(n) && n >= 0) estimatedFare = n;
  }
  const copaymentExempt = body.copaymentExempt === true || body.copayment_exempt === true;
  return { estimatedFare, copaymentExempt };
}

export function buildMedicalScanCopayment(input: {
  estimatedFare?: number | null;
  copaymentExempt?: boolean;
}): MedicalScanCopaymentDto {
  const exemptDeclared = input.copaymentExempt === true;
  const fare =
    typeof input.estimatedFare === "number" && Number.isFinite(input.estimatedFare) && input.estimatedFare >= 0
      ? input.estimatedFare
      : null;

  if (exemptDeclared) {
    return {
      required: "no",
      amountEstimated: 0,
      amountMinEur: COPAYMENT_MIN_EUR,
      amountMaxEur: COPAYMENT_MAX_EUR,
      ruleDe: MEDICAL_COPAYMENT_RULE_DE,
      exemptDeclared: true,
      noteDe: "Zuzahlungsbefreiung angegeben — Eigenanteil 0,00 € (Nachweis bereithalten).",
    };
  }

  if (fare != null) {
    const amountEstimated = calculateMedicalCopaymentEur(fare, false);
    return {
      required: "yes",
      amountEstimated,
      amountMinEur: COPAYMENT_MIN_EUR,
      amountMaxEur: COPAYMENT_MAX_EUR,
      ruleDe: MEDICAL_COPAYMENT_RULE_DE,
      exemptDeclared: false,
      noteDe: `Geschätzter Eigenanteil (Zuzahlung): ${amountEstimated.toFixed(2).replace(".", ",")} €`,
    };
  }

  return {
    required: "yes",
    amountEstimated: null,
    amountMinEur: COPAYMENT_MIN_EUR,
    amountMaxEur: COPAYMENT_MAX_EUR,
    ruleDe: MEDICAL_COPAYMENT_RULE_DE,
    exemptDeclared: false,
    noteDe: `Zuzahlung voraussichtlich ${COPAYMENT_MIN_EUR}–${COPAYMENT_MAX_EUR} € (${MEDICAL_COPAYMENT_RULE_DE}). Betrag nach Fahrpreis-Schätzung.`,
  };
}
