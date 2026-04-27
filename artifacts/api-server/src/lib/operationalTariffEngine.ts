export type SurchargeBlock = { enabled?: boolean; percent?: number };
export type TariffSurcharges = {
  night?: SurchargeBlock;
  weekend?: SurchargeBlock;
  holiday?: SurchargeBlock;
};

function addressMatchesServiceTermsLocal(address: string, terms: string[]): boolean {
  if (!address || terms.length === 0) return false;
  const a = address.toLowerCase();
  for (const t of terms) {
    const s = String(t).trim().toLowerCase();
    if (s && a.includes(s)) return true;
  }
  return false;
}

export function isPlainTariffObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function n(v: unknown, fallback: number): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : fallback;
}

/**
 * Fahrtminuten-Preis (Routenzeit, kein Warten).
 * `perMin` 0 würde fälschlich ein gesetztes `pricePerMinute` (Legacy/Admin) überschatten;
 * deshalb: positiver Wert in `perMin` gewinnt, sonst `pricePerMinute`, sonst 0.
 */
export function resolveTripEurPerRouteMinute(merged: Record<string, unknown>): number {
  const a = n(merged.perMin, 0);
  const b = n(merged.pricePerMinute, 0);
  if (a > 0) return a;
  if (b > 0) return b;
  return 0;
}

/** Deckt globalen tariffs-Abschnitt und optionalen Eintrag in tariffs.byServiceRegion ab. */
export function mergeTariffsForServiceRegion(
  globalTariff: Record<string, unknown>,
  regionOverride: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const g = { ...globalTariff };
  delete (g as { byServiceRegion?: unknown }).byServiceRegion;
  if (!regionOverride || !isPlainTariffObject(regionOverride)) {
    return { ...g };
  }
  const r = { ...regionOverride };
  delete (r as { byServiceRegion?: unknown }).byServiceRegion;
  const out: Record<string, unknown> = { ...g, ...r };

  /**
   * Wenn in der Region `pricePerMinute: 0` bzw. `perMin: 0` (gespeichert / Admin-Form) das globale
   * `pricePerMinute: 0.63` überschreibt, ist `resolveTripEurPerRouteMinute(merged) === 0` — Bug.
   * Ausnahme: Region explizit mit *beiden* Werten 0, dann als „wirklich aus“ werten, kein Fallback.
   */
  const gTrip = resolveTripEurPerRouteMinute(g as Record<string, unknown>);
  const oTrip = resolveTripEurPerRouteMinute(out);
  if (gTrip > 0 && oTrip === 0) {
    const explicitPerMin0 =
      "perMin" in r && n((r as Record<string, unknown>).perMin) === 0;
    const explicitPpm0 =
      "pricePerMinute" in r && n((r as Record<string, unknown>).pricePerMinute) === 0;
    const bothExplicitlyZeroed = explicitPerMin0 && explicitPpm0;
    if (!bothExplicitlyZeroed) {
      (out as { pricePerMinute: unknown }).pricePerMinute = (g as Record<string, unknown>).pricePerMinute;
      (out as { perMin: unknown }).perMin = (g as Record<string, unknown>).perMin;
    }
  }

  return out;
}

/**
 * Wählt die erste passende Einfahrt-Region (wie Provisions-Logik).
 * `fromFull` muss i. d. R. vollständige Adresse (Start) sein.
 */
export function findServiceRegionIdForFrom(
  fromFull: string,
  serviceRegions: { id: string; matchTerms: string[]; isActive: boolean }[],
): string | null {
  const from = String(fromFull ?? "").trim();
  for (const reg of serviceRegions.filter((r) => r.isActive)) {
    if (addressMatchesServiceTermsLocal(from, reg.matchTerms)) {
      return reg.id;
    }
  }
  return null;
}

export function resolveMergedTariff(
  opPayload: Record<string, unknown>,
  serviceRegions: { id: string; matchTerms: string[]; isActive: boolean }[],
  fromFull: string,
): { merged: Record<string, unknown>; serviceRegionId: string | null } {
  const defT: Record<string, unknown> = {};
  const t = {
    ...defT,
    ...(isPlainTariffObject(opPayload.tariffs) ? (opPayload.tariffs as Record<string, unknown>) : {}),
  };
  const bySr = isPlainTariffObject(t.byServiceRegion) ? (t.byServiceRegion as Record<string, unknown>) : {};
  const id = findServiceRegionIdForFrom(fromFull, serviceRegions);
  const reg = id && isPlainTariffObject(bySr[id]) ? (bySr[id] as Record<string, unknown>) : null;
  const merged = mergeTariffsForServiceRegion(t, reg);
  return { merged, serviceRegionId: id };
}

const BERLIN_TZ = "Europe/Berlin";

function getBerlinHourAndWeekday(d: Date): { hour: number; weekday0Sun: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BERLIN_TZ,
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  })
    .formatToParts(d)
    .filter((p) => p.type === "hour" || p.type === "weekday");
  const hourS = parts.find((p) => p.type === "hour")?.value;
  const wdS = parts.find((p) => p.type === "weekday")?.value;
  const hour = hourS != null ? Math.min(23, Math.max(0, parseInt(hourS, 10) || 0)) : 12;
  // en-GB short weekday: Sun, Mon, ...
  const wmap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday0Sun = wdS && wmap[wdS] != null ? wmap[wdS]! : 1;
  return { hour, weekday0Sun };
}

function isWeekend(d: Date): boolean {
  const { weekday0Sun } = getBerlinHourAndWeekday(d);
  return weekday0Sun === 0 || weekday0Sun === 6;
}

function isNightDefault(d: Date, startHour = 22, endHour = 6): boolean {
  const { hour } = getBerlinHourAndWeekday(d);
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  return hour >= startHour || hour < endHour;
}

export function ceilTenthEur(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.ceil((x + Number.EPSILON) * 10) / 10;
}

export function applyRounding(raw: number, mode: string | undefined): number {
  if (!Number.isFinite(raw)) return 0;
  const m = typeof mode === "string" ? mode.trim() : "ceil_tenth";
  if (m === "ceil_euro" || m === "ceil_eur") return Math.ceil(raw - Number.EPSILON);
  if (m === "nearest_tenth" || m === "round_tenth")
    return Math.round((raw + Number.EPSILON) * 10) / 10;
  if (m === "floor_tenth")
    return Math.floor((raw + Number.EPSILON) * 10) / 10;
  return ceilTenthEur(raw);
}

export type EstimateInputs = {
  distanceKm: number;
  /** Fahrt-/Routenminuten (Fahrtminutenzuschlag / Zeitkomponente — nicht Warten am Rand) */
  tripMinutes: number;
  /** reine Wartezeit (€/h aus `waitingPerHour` → €/min) */
  waitingMinutes: number;
  /** Klasse, z. B. standard, xl, wheelchair, onroda */
  vehicle: string;
  at: Date;
  /** Test-Preview: Feiertagszuschlag (kein behördliches Feiertagskalender-Modell) */
  applyHolidaySurcharge?: boolean;
  /** Flughafen-Pauschale aus `airportFlatEur`, sofern Tarif > 0 */
  applyAirportFlat?: boolean;
};

/**
 * Fahrpreis aus voll mergiertem Tarif-Objekt (nur Config, keine lokalen Konstanten).
 * Unterstützt: Einheitspreis pro km (perKm) ODER Zwei-Staffel (rateFirstPerKm, rateAfterPerKm, thresholdKm),
 * pro Minute (perMin) für Routenminuten, Warte-Pauschale, Mindestfahrpreis, %-Zuschläge Nacht/WE.
 */
export function estimateTaxiFromMergedTariff(
  merged: Record<string, unknown>,
  in_: EstimateInputs,
): {
  subtotal: number;
  afterMinFare: number;
  afterSurcharges: number;
  finalRounded: number;
  breakdown: {
    baseFare: number;
    distanceCharge: number;
    tripMinutesCharge: number;
    /** Wartezeit (€) — aus €/h, nicht aus Fahrtminuten */
    waitingCharge: number;
    /** optional Pauschale, nur wenn `applyAirportFlat` */
    airportFlatEur: number;
    minFare: number;
    surcharges: { type: string; amount: number }[];
    vehicleClassMultiplier: number;
  };
} {
  const m = merged;
  const multRaw = isPlainTariffObject(m.vehicleClassMultipliers)
    ? (m.vehicleClassMultipliers as Record<string, unknown>)
    : {
        standard: 1,
        xl: 1.2,
        wheelchair: 1.15,
        onroda: 1,
      };
  const vClass = in_.vehicle && String(in_.vehicle).trim() ? String(in_.vehicle).trim().toLowerCase() : "standard";
  const vehicleClassMultiplier = n(
    multRaw[vClass] ?? (typeof multRaw["standard"] === "number" ? multRaw["standard"] : 1),
    1,
  );
  if (m.active === false) {
    return {
      subtotal: 0,
      afterMinFare: 0,
      afterSurcharges: 0,
      finalRounded: 0,
      breakdown: {
        baseFare: 0,
        distanceCharge: 0,
        tripMinutesCharge: 0,
        waitingCharge: 0,
        airportFlatEur: 0,
        minFare: 0,
        surcharges: [],
        vehicleClassMultiplier: vehicleClassMultiplier,
      },
    };
  }

  const baseFare = n(m.baseFare, 0);
  const dKm = Math.max(0, in_.distanceKm);
  const perKmN = n(m.perKm, 0);
  const kmModel: "single" | "two_tier" =
    m.kmPricingModel === "single" || (perKmN > 0 && m.kmPricingModel !== "two_tier") ? "single" : "two_tier";

  let distanceCharge = 0;
  if (kmModel === "single") {
    const perKm = perKmN > 0 ? perKmN : n(m.rateAfterPerKm, 0) || 0;
    distanceCharge = dKm * perKm;
  } else {
    const rateFirst = n(m.rateFirstPerKm, 0);
    const rateAfter = n(m.rateAfterPerKm, 0);
    const th = n(m.thresholdKm, 4);
    if (dKm <= th) distanceCharge = dKm * rateFirst;
    else distanceCharge = th * rateFirst + (dKm - th) * rateAfter;
  }

  const waitPerH = n(m.waitingPerHour, 0);
  const tripEurPerMin = resolveTripEurPerRouteMinute(m);
  const waitMin = Math.max(0, in_.waitingMinutes);
  const tripMin = Math.max(0, in_.tripMinutes);
  const waitingCharge = (waitPerH / 60) * waitMin;
  const tripMinutesCharge = tripEurPerMin * tripMin;
  const airportFlat = in_.applyAirportFlat ? n(m.airportFlatEur, 0) : 0;

  let subtotal = baseFare + distanceCharge + tripMinutesCharge + waitingCharge + airportFlat;
  const minFare = n(m.minFare, n(m.minPrice, 0));
  const afterMinFare = minFare > 0 && subtotal < minFare ? minFare : subtotal;
  const sur: { type: string; amount: number }[] = [];
  const sroot = isPlainTariffObject(m.surcharges) ? (m.surcharges as TariffSurcharges) : ({} as TariffSurcharges);

  let withExtra = afterMinFare;
  const t = in_.at;
  const hasStructNight = sroot.night && typeof sroot.night === "object";
  if (hasStructNight && sroot.night?.enabled && n(sroot.night?.percent, 0) > 0 && isNightDefault(t)) {
    const a = (afterMinFare * n(sroot.night?.percent, 0)) / 100;
    withExtra += a;
    sur.push({ type: "night", amount: a });
  } else if (!hasStructNight && n(m.nightSurchargePercent, 0) > 0 && isNightDefault(t)) {
    const a = (afterMinFare * n(m.nightSurchargePercent, 0)) / 100;
    withExtra += a;
    sur.push({ type: "night", amount: a });
  }
  const hasStructWe = sroot.weekend && typeof sroot.weekend === "object";
  if (hasStructWe && sroot.weekend?.enabled && n(sroot.weekend?.percent, 0) > 0 && isWeekend(t)) {
    const a = (afterMinFare * n(sroot.weekend?.percent, 0)) / 100;
    withExtra += a;
    sur.push({ type: "weekend", amount: a });
  } else if (!hasStructWe && n(m.weekendSurchargePercent, 0) > 0 && isWeekend(t)) {
    const a = (afterMinFare * n(m.weekendSurchargePercent, 0)) / 100;
    withExtra += a;
    sur.push({ type: "weekend", amount: a });
  }
  const hasStructHol = sroot.holiday && typeof sroot.holiday === "object";
  if (in_.applyHolidaySurcharge) {
    if (hasStructHol && sroot.holiday?.enabled && n(sroot.holiday?.percent, 0) > 0) {
      const a = (afterMinFare * n(sroot.holiday?.percent, 0)) / 100;
      withExtra += a;
      sur.push({ type: "holiday", amount: a });
    } else if (!hasStructHol && n(m.holidaySurchargePercent, 0) > 0) {
      const a = (afterMinFare * n(m.holidaySurchargePercent, 0)) / 100;
      withExtra += a;
      sur.push({ type: "holiday", amount: a });
    }
  }

  const withVehicle = withExtra * vehicleClassMultiplier;
  const rounding = typeof m.rounding === "string" ? m.rounding : "ceil_tenth";
  return {
    subtotal,
    afterMinFare: afterMinFare,
    afterSurcharges: withExtra * vehicleClassMultiplier,
    finalRounded: applyRounding(withVehicle, rounding),
    breakdown: {
      baseFare,
      distanceCharge,
      tripMinutesCharge,
      waitingCharge,
      airportFlatEur: airportFlat,
      minFare,
      surcharges: sur,
      vehicleClassMultiplier,
    },
  };
}

/** Merged Tarif → bisherige PublicFareProfile-Form (Kompat. Admin/Mobile). */
export type ResolvedFareProfile = {
  areaId: string | null;
  areaName: string;
  serviceRegionId: string | null;
  baseFareEur: number;
  rateFirstKmEur: number;
  rateAfterKmEur: number;
  thresholdKm: number;
  waitingPerHourEur: number;
  serviceFeeEur: number;
  onrodaBaseFareEur: number;
  onrodaPerKmEur: number;
  onrodaMinFareEur: number;
  manualFixedPriceEur: number | null;
  pricePerMinute: number;
};

export function mergedTariffToPublicProfile(
  merged: Record<string, unknown>,
  serviceRegionId: string | null,
  areaName: string,
  areaId: string | null,
): ResolvedFareProfile {
  const base = n(merged.baseFare, 4.3);
  const perKm = n(merged.perKm, 0);
  const th = n(merged.thresholdKm, 4);
  const useSingle = perKm > 0 && merged.kmPricingModel !== "two_tier";
  if (useSingle) {
    return {
      areaId: areaId ?? null,
      areaName,
      serviceRegionId: serviceRegionId ?? null,
      baseFareEur: base,
      rateFirstKmEur: perKm,
      rateAfterKmEur: perKm,
      thresholdKm: th > 0 ? th : 9999,
      waitingPerHourEur: n(merged.waitingPerHour, 0),
      serviceFeeEur: 0,
      onrodaBaseFareEur: n(merged.onrodaFixBase, base),
      onrodaPerKmEur: n(merged.onrodaFixPerKm, perKm),
      onrodaMinFareEur: n(merged.minFare, n(merged.minPrice, 0)),
      manualFixedPriceEur: null,
      pricePerMinute: resolveTripEurPerRouteMinute(merged),
    };
  }
  return {
    areaId: areaId ?? null,
    areaName,
    serviceRegionId: serviceRegionId ?? null,
    baseFareEur: base,
    rateFirstKmEur: n(merged.rateFirstPerKm, 3.0),
    rateAfterKmEur: n(merged.rateAfterPerKm, 2.5),
    thresholdKm: th,
    waitingPerHourEur: n(merged.waitingPerHour, 38),
    serviceFeeEur: n(merged.serviceFee, 0),
    onrodaBaseFareEur: n(merged.onrodaFixBase, 3.5),
    onrodaPerKmEur: n(merged.onrodaFixPerKm, 2.2),
    onrodaMinFareEur: n(merged.minFare, 0),
    manualFixedPriceEur: null,
    pricePerMinute: resolveTripEurPerRouteMinute(merged),
  };
}

export function getCancellationFeeEurFromMerged(merged: Record<string, unknown>): number {
  return n(merged.cancellationFeeEur, 0);
}
