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
 * Taxameter-Schätzung — ausschließlich aus `AppTariffConfig` (siehe GET /api/app/config, ggf. Region), keine festen Maut-Werte.
 */
export function calculateFare(
  distanceKm: number,
  waitingMinutes: number = 0,
  tariffs: AppTariffConfig = FALLBACK_TARIFF,
): FareBreakdown {
  return calculateFareFromAppConfig(distanceKm, waitingMinutes, tariffs);
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
  /** Wenn &gt; 0 und kein two_tier: Preis pro km (kompletter Kilometer) */
  perKm?: number;
  perMin?: number;
  minFare?: number;
  kmPricingModel?: "single" | "two_tier";
};

export const FALLBACK_TARIFF: AppTariffConfig = {
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
  const perKm = num((raw as { perKm?: unknown }).perKm, 0);
  return {
    baseFare: num(raw.baseFare, FALLBACK_TARIFF.baseFare),
    rateFirstPerKm: num(raw.rateFirstPerKm, FALLBACK_TARIFF.rateFirstPerKm),
    rateAfterPerKm: num(raw.rateAfterPerKm, FALLBACK_TARIFF.rateAfterPerKm),
    thresholdKm: num(raw.thresholdKm, FALLBACK_TARIFF.thresholdKm),
    waitingPerHour: num(raw.waitingPerHour, FALLBACK_TARIFF.waitingPerHour),
    onrodaFixBase: num(raw.onrodaFixBase, FALLBACK_TARIFF.onrodaFixBase),
    onrodaFixPerKm: num(raw.onrodaFixPerKm, FALLBACK_TARIFF.onrodaFixPerKm),
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
  tariffs: AppTariffConfig = FALLBACK_TARIFF,
): FareBreakdown {
  return calculateOnrodaFixFareConfig(distanceKm, tariffs);
}

export function formatEuro(amount: number): string {
  return amount.toFixed(2).replace(".", ",") + " €";
}
