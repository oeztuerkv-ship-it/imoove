/** Status vor tatsächlicher Fahrt zum Ziel — Abschluss nur mit 0 € (keine Beförderung). */
export const DRIVER_PRE_TRIP_STATUSES = ["accepted", "driver_arriving", "driver_waiting"] as const;

export function isDriverPreTripStatus(status: string): boolean {
  return (DRIVER_PRE_TRIP_STATUSES as readonly string[]).includes(status);
}

/** Fahrt zum Ziel läuft — Endpreis > 0 erlaubt. */
export function isDriverTripInProgressStatus(status: string): boolean {
  return status === "in_progress";
}

/** Nur dann Schätzpreis anzeigen / als Voreinstellung — nach Slide „Fahrt beginnen“ (Status in_progress). */
export function driverMayBillPositiveFare(status: string): boolean {
  return isDriverTripInProgressStatus(status);
}

export function defaultFinalFareForDriverCompletion(status: string, _estimatedFare: number): number {
  if (!driverMayBillPositiveFare(status)) return 0;
  return 0;
}

export function driverSkipsManualFareEntry(pricingMode: string | null | undefined): boolean {
  return String(pricingMode ?? "").trim() === "fixed_price";
}

/** Vereinbarter Festpreis aus Ride (estimatedFare). */
export function driverAgreedFixedPriceEur(input: {
  pricingMode?: string | null;
  estimatedFare: number;
}): number | null {
  if (!driverSkipsManualFareEntry(input.pricingMode)) return null;
  const n = Number(input.estimatedFare);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Leeres Eingabefeld (Taxameter) oder vorbefüllter Festpreis ohne manuelle Eingabe. */
export function defaultDriverFareInputForCompletion(
  status: string,
  estimatedFare = 0,
  pricingMode?: string | null,
): string {
  if (!driverMayBillPositiveFare(status)) return formatDriverFareInputDe(0);
  const agreed = driverAgreedFixedPriceEur({ pricingMode, estimatedFare });
  if (agreed != null) return formatDriverFareInputDe(agreed);
  return "";
}

export function formatDriverFareInputDe(amount: number): string {
  return amount.toFixed(2).replace(".", ",");
}

const MIN_ESTIMATE_FOR_CHECK_EUR = 8;
const RATIO_CAP = 2.5;
const ABS_SURCHARGE_CAP_EUR = 40;

export function maxAllowedDriverFinalFareEur(estimatedFare: number): number {
  const est = Number(estimatedFare);
  if (!Number.isFinite(est) || est <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(est * RATIO_CAP, est + ABS_SURCHARGE_CAP_EUR);
}

/** Starker Ausreißer vs. Schätzung — Server verlangt ggf. finalFarePlausibilityAck. */
export function driverFinalFareNeedsAcknowledgement(estimatedFare: number, finalFare: number): boolean {
  const est = Number(estimatedFare);
  const fin = Number(finalFare);
  if (!Number.isFinite(est) || est < MIN_ESTIMATE_FOR_CHECK_EUR) return false;
  if (!Number.isFinite(fin) || fin < 0) return false;
  return fin > maxAllowedDriverFinalFareEur(est) + 1e-9;
}

export function validateDriverFinalFareInput(
  status: string,
  fare: number,
): { ok: true } | { ok: false; title: string; message: string } {
  if (!Number.isFinite(fare) || fare < 0) {
    return { ok: false, title: "Ungültiger Betrag", message: "Bitte einen gültigen Betrag in Euro eingeben." };
  }
  if (isDriverPreTripStatus(status) && fare > 0.009) {
    return {
      ok: false,
      title: "Keine Fahrt durchgeführt",
      message:
        "Ohne Fahrtbeginn zum Ziel ist kein Fahrpreis zulässig. Bitte 0,00 € eingeben oder die Fahrt über „Fahrt stornieren“ abbrechen.",
    };
  }
  if (status === "passenger_onboard" && fare > 0.009) {
    return {
      ok: false,
      title: "Fahrt noch nicht gestartet",
      message: "Bitte die Fahrt zum Ziel beginnen, bevor ein Fahrpreis abgerechnet wird — oder 0,00 € bei Abbruch ohne Fahrt.",
    };
  }
  return { ok: true };
}
