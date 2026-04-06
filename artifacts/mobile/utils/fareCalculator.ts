export type FareKind = "taxameter" | "onroda_fix";

export interface FareBreakdown {
  baseFare: number;
  distanceCharge: number;
  waitingCharge: number;
  total: number;
  distanceKm: number;
  /** Standard-Taxameter-Schätzung vs. Onroda-Fixpreisformel */
  fareKind?: FareKind;
}

/**
 * Esslinger Taxitarif:
 *  Grundgebühr:        4,30 €
 *  Tarif 1 (0–4 km):  3,00 € pro km
 *  Tarif 2 (ab 4 km): 2,50 € pro km
 *  Wartezeit:         38,00 € pro Stunde
 */
export function calculateFare(
  distanceKm: number,
  waitingMinutes: number = 0
): FareBreakdown {
  const BASE_FARE = 4.3;
  const RATE_FIRST = 3.0;
  const RATE_AFTER = 2.5;
  const THRESHOLD_KM = 4;
  const WAITING_RATE_PER_MIN = 38 / 60;

  if (distanceKm <= 0) {
    return {
      baseFare: BASE_FARE,
      distanceCharge: 0,
      waitingCharge: 0,
      total: BASE_FARE,
      distanceKm: 0,
      fareKind: "taxameter",
    };
  }

  let distanceCharge: number;

  if (distanceKm <= THRESHOLD_KM) {
    distanceCharge = distanceKm * RATE_FIRST;
  } else {
    distanceCharge =
      THRESHOLD_KM * RATE_FIRST + (distanceKm - THRESHOLD_KM) * RATE_AFTER;
  }

  const waitingCharge = waitingMinutes * WAITING_RATE_PER_MIN;
  const total = BASE_FARE + distanceCharge + waitingCharge;

  return {
    baseFare: BASE_FARE,
    distanceCharge: Math.round(distanceCharge * 10) / 10,
    waitingCharge: Math.round(waitingCharge * 10) / 10,
    total: Math.round(total * 10) / 10,
    distanceKm: Math.round(distanceKm * 100) / 100,
    fareKind: "taxameter",
  };
}

/** Onroda Fixpreis: 3,50 € Basis + 2,20 € pro km (lt. Produktvorgabe). */
export function calculateOnrodaFixFare(distanceKm: number): FareBreakdown {
  const BASE = 3.5;
  const PER_KM = 2.2;
  const d = Math.max(0, distanceKm);
  const distanceCharge = Math.round(d * PER_KM * 100) / 100;
  const total = Math.round((BASE + distanceCharge) * 100) / 100;
  return {
    baseFare: BASE,
    distanceCharge,
    waitingCharge: 0,
    total,
    distanceKm: Math.round(d * 100) / 100,
    fareKind: "onroda_fix",
  };
}

export function formatEuro(amount: number): string {
  return amount.toFixed(2).replace(".", ",") + " €";
}
