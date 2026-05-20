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

export function defaultFinalFareForDriverCompletion(status: string, estimatedFare: number): number {
  if (!driverMayBillPositiveFare(status)) return 0;
  return Number.isFinite(estimatedFare) ? estimatedFare : 0;
}

export function formatDriverFareInputDe(amount: number): string {
  return amount.toFixed(2).replace(".", ",");
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
