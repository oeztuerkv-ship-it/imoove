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

/** Immer kaufmännisch "nach oben" auf 10-Cent-Stufen (z. B. 11,23 -> 11,30). */
export function ceilToTenth(amount: number): number {
  const safe = Number.isFinite(amount) ? amount : 0;
  return Math.ceil((safe + Number.EPSILON) * 10) / 10;
}

/** Auf volle Euro nach oben (z. B. 80,10 -> 81,00). */
function ceilToEuro(amount: number): number {
  const safe = Number.isFinite(amount) ? amount : 0;
  return Math.ceil(safe - Number.EPSILON);
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
    distanceCharge: ceilToTenth(distanceCharge),
    waitingCharge: ceilToTenth(waitingCharge),
    total: ceilToTenth(total),
    distanceKm: Math.round(distanceKm * 100) / 100,
    fareKind: "taxameter",
  };
}

/** Onroda Fixpreis: 3,50 € Basis + 2,20 € pro km (lt. Produktvorgabe). */
/** Werte aus `GET /api/app/config` → `tariffs` (Backend-Steuerung). */
export type AppTariffConfig = {
  baseFare: number;
  rateFirstPerKm: number;
  rateAfterPerKm: number;
  thresholdKm: number;
  waitingPerHour: number;
  onrodaFixBase: number;
  onrodaFixPerKm: number;
};

const FALLBACK_TARIFF: AppTariffConfig = {
  baseFare: 4.3,
  rateFirstPerKm: 3.0,
  rateAfterPerKm: 2.5,
  thresholdKm: 4,
  waitingPerHour: 38,
  onrodaFixBase: 3.5,
  onrodaFixPerKm: 2.2,
};

function num(v: unknown, d: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
}

export function appTariffFromRecord(raw: Record<string, unknown> | null | undefined): AppTariffConfig {
  if (!raw || typeof raw !== "object") return { ...FALLBACK_TARIFF };
  return {
    baseFare: num(raw.baseFare, FALLBACK_TARIFF.baseFare),
    rateFirstPerKm: num(raw.rateFirstPerKm, FALLBACK_TARIFF.rateFirstPerKm),
    rateAfterPerKm: num(raw.rateAfterPerKm, FALLBACK_TARIFF.rateAfterPerKm),
    thresholdKm: num(raw.thresholdKm, FALLBACK_TARIFF.thresholdKm),
    waitingPerHour: num(raw.waitingPerHour, FALLBACK_TARIFF.waitingPerHour),
    onrodaFixBase: num(raw.onrodaFixBase, FALLBACK_TARIFF.onrodaFixBase),
    onrodaFixPerKm: num(raw.onrodaFixPerKm, FALLBACK_TARIFF.onrodaFixPerKm),
  };
}

/**
 * Schätzpreis (Taxameter-Logik) aus plattformgesteuerten Tarifparametern — ersetzt fest im Code hinterlegte Konstanten.
 */
export function calculateFareFromAppConfig(
  distanceKm: number,
  waitingMinutes: number,
  tariffs: AppTariffConfig,
): FareBreakdown {
  const t = tariffs;
  const waitPerMin = t.waitingPerHour / 60;
  if (distanceKm <= 0) {
    return {
      baseFare: t.baseFare,
      distanceCharge: 0,
      waitingCharge: 0,
      total: t.baseFare,
      distanceKm: 0,
      fareKind: "taxameter",
    };
  }
  let distanceCharge: number;
  if (distanceKm <= t.thresholdKm) {
    distanceCharge = distanceKm * t.rateFirstPerKm;
  } else {
    distanceCharge = t.thresholdKm * t.rateFirstPerKm + (distanceKm - t.thresholdKm) * t.rateAfterPerKm;
  }
  const waitingCharge = waitingMinutes * waitPerMin;
  const total = t.baseFare + distanceCharge + waitingCharge;
  return {
    baseFare: t.baseFare,
    distanceCharge: ceilToTenth(distanceCharge),
    waitingCharge: ceilToTenth(waitingCharge),
    total: ceilToTenth(total),
    distanceKm: Math.round(distanceKm * 100) / 100,
    fareKind: "taxameter",
  };
}

export function calculateOnrodaFixFareConfig(distanceKm: number, tariffs: AppTariffConfig): FareBreakdown {
  const d = Math.max(0, distanceKm);
  const distanceCharge = ceilToTenth(d * tariffs.onrodaFixPerKm);
  const total = ceilToEuro(tariffs.onrodaFixBase + distanceCharge);
  return {
    baseFare: tariffs.onrodaFixBase,
    distanceCharge,
    waitingCharge: 0,
    total,
    distanceKm: Math.round(d * 100) / 100,
    fareKind: "onroda_fix",
  };
}

export function calculateOnrodaFixFare(distanceKm: number): FareBreakdown {
  const BASE = 3.5;
  const PER_KM = 2.2;
  const d = Math.max(0, distanceKm);
  const distanceCharge = ceilToTenth(d * PER_KM);
  const total = ceilToEuro(BASE + distanceCharge);
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
