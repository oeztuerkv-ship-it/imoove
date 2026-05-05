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

/** Werte aus `GET /api/app/config` → `tariffs` (Backend-Steuerung). */
export type AppTariffConfig = {
  baseFare: number;
  rateFirstPerKm: number;
  rateAfterPerKm: number;
  thresholdKm: number;
  waitingPerHour: number;
  onrodaFixBase: number;
  onrodaFixPerKm: number;
  /** Wenn &gt; 0 und kein two_tier: Preis pro km (kompletter Kilometer) */
  perKm?: number;
  perMin?: number;
  minFare?: number;
  kmPricingModel?: "single" | "two_tier";
};

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
 * Taxameter-Schätzung — ausschließlich aus `AppTariffConfig` (siehe GET /api/app/config, ggf. Region), keine festen Maut-Werte.
 */
/** Leerer Tarif — nur bis die API geladen ist; keine festen Produkt-Euro im Client. */
const EMPTY_APP_TARIFF: AppTariffConfig = {
  baseFare: 0,
  rateFirstPerKm: 0,
  rateAfterPerKm: 0,
  thresholdKm: 0,
  waitingPerHour: 0,
  onrodaFixBase: 0,
  onrodaFixPerKm: 0,
};

export function calculateFare(
  distanceKm: number,
  waitingMinutes: number = 0,
  tariffs: AppTariffConfig = EMPTY_APP_TARIFF,
): FareBreakdown {
  return calculateFareFromAppConfig(distanceKm, waitingMinutes, tariffs);
}

/** @deprecated Nutzen Sie `appTariffFromRecord` / Server-Tarife — keine festen Fallback-Euro. */
export const FALLBACK_TARIFF: AppTariffConfig = { ...EMPTY_APP_TARIFF };

function num(v: unknown, d: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
}

export function appTariffFromRecord(raw: Record<string, unknown> | null | undefined): AppTariffConfig {
  if (!raw || typeof raw !== "object") return { ...EMPTY_APP_TARIFF };
  const perKm = num((raw as { perKm?: unknown }).perKm, 0);
  return {
    baseFare: num(raw.baseFare, 0),
    rateFirstPerKm: num(raw.rateFirstPerKm, 0),
    rateAfterPerKm: num(raw.rateAfterPerKm, 0),
    thresholdKm: num(raw.thresholdKm, 0),
    waitingPerHour: num(raw.waitingPerHour, 0),
    onrodaFixBase: num(raw.onrodaFixBase, 0),
    onrodaFixPerKm: num(raw.onrodaFixPerKm, 0),
    perKm: perKm > 0 ? perKm : undefined,
    perMin: (raw as { perMin?: unknown }).perMin != null ? num((raw as { perMin?: unknown }).perMin, 0) : undefined,
    minFare: (raw as { minFare?: unknown }).minFare != null ? num((raw as { minFare?: unknown }).minFare, 0) : undefined,
    kmPricingModel: raw.kmPricingModel === "two_tier" ? "two_tier" : perKm > 0 ? "single" : "two_tier",
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
  if (t.perKm != null && t.perKm > 0 && t.kmPricingModel !== "two_tier") {
    distanceCharge = distanceKm * t.perKm;
  } else if (distanceKm <= t.thresholdKm) {
    distanceCharge = distanceKm * t.rateFirstPerKm;
  } else {
    distanceCharge = t.thresholdKm * t.rateFirstPerKm + (distanceKm - t.thresholdKm) * t.rateAfterPerKm;
  }
  const waitingCharge = waitingMinutes * waitPerMin;
  const totalRaw = t.baseFare + distanceCharge + waitingCharge;
  const withMin = t.minFare && t.minFare > 0 && totalRaw < t.minFare ? t.minFare : totalRaw;
  return {
    baseFare: t.baseFare,
    distanceCharge: ceilToTenth(distanceCharge),
    waitingCharge: ceilToTenth(waitingCharge),
    total: ceilToTenth(withMin),
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

export function calculateOnrodaFixFare(
  distanceKm: number,
  tariffs: AppTariffConfig = EMPTY_APP_TARIFF,
): FareBreakdown {
  return calculateOnrodaFixFareConfig(distanceKm, tariffs);
}

export function formatEuro(amount: number): string {
  return amount.toFixed(2).replace(".", ",") + " €";
}
