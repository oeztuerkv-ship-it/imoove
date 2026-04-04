export interface FareBreakdown {
  baseFare: number;
  distanceCharge: number;
  waitingCharge: number;
  total: number;
  distanceKm: number;
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
  };
}

export function formatEuro(amount: number): string {
  return amount.toFixed(2).replace(".", ",") + " €";
}
