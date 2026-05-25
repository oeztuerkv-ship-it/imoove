import type { MedicalOcrExtracted } from "./medicalOcrNormalize";
import { normalizeMedicalOcrDate } from "./medicalOcrNormalize";

export const MEDICAL_DATE_LOGIC_TYPES = [
  "today",
  "series",
  "return_trip",
  "long_term_treatment",
] as const;

export type MedicalDateLogicType = (typeof MEDICAL_DATE_LOGIC_TYPES)[number];

export function isMedicalDateLogicType(v: string): v is MedicalDateLogicType {
  return (MEDICAL_DATE_LOGIC_TYPES as readonly string[]).includes(v);
}

export function parseMedicalDateLogicType(raw: string | undefined | null): MedicalDateLogicType {
  const v = (raw ?? "").trim().toLowerCase();
  return isMedicalDateLogicType(v) ? v : "today";
}

const BERLIN_TZ = "Europe/Berlin";

/** Vorstationär (Muster-4): Fahrt höchstens 3 Kalendertage vor Aufnahme, nicht danach. */
const VORSTATIONAER_MAX_DAYS_BEFORE_ADMISSION = 3;
/** Nachstationär (Muster-4): Fahrt höchstens 7 Kalendertage nach Entlassung. */
const NACHSTATIONAER_MAX_DAYS_AFTER_DISCHARGE = 7;

export const MEDICAL_STATIONAER_KONTEXT_WARNING_CODES = [
  "vorstationaer_outside_window",
  "nachstationaer_outside_window",
  "vorstationaer_missing_aufnahmedatum",
  "nachstationaer_missing_entlassungsdatum",
] as const;

export type MedicalDateLogicSeriesContext = {
  id: string;
  validFrom: Date | string | null;
  validUntil: Date | string | null;
  totalRides: number;
  completedRides?: number;
};

export type MedicalDateLogicInput = {
  dateLogicType: MedicalDateLogicType;
  rideScheduledAt: Date | string | null;
  now?: Date;
  series?: MedicalDateLogicSeriesContext | null;
  returnRideScheduledAt?: Date | string | null;
  extracted: MedicalOcrExtracted;
};

export type MedicalDateLogicSeverity = "ok" | "warn" | "fail";

export type MedicalDateLogicResult = {
  type: MedicalDateLogicType;
  passed: boolean;
  severity: MedicalDateLogicSeverity;
  expectedDate: string | null;
  ocrDate: string | null;
  warningCodes: string[];
  details: Record<string, unknown>;
};

function berlinCalendarDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BERLIN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? new Date(t) : null;
}

function dayDiff(a: string, b: string): number | null {
  const ta = Date.parse(`${a}T12:00:00.000Z`);
  const tb = Date.parse(`${b}T12:00:00.000Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round((ta - tb) / 86_400_000);
}

function pickOcrRideDate(extracted: MedicalOcrExtracted): string | null {
  return extracted.transportDate ?? extracted.validFrom ?? null;
}

function mergeDateLogicSeverity(
  current: MedicalDateLogicSeverity,
  next: MedicalDateLogicSeverity,
): MedicalDateLogicSeverity {
  if (current === "fail" || next === "fail") return "fail";
  if (current === "warn" || next === "warn") return "warn";
  return "ok";
}

/**
 * Vor-/Nachstationär nur aus OCR (`behandlungsKontext` + Aufnahme-/Entlassungsdatum).
 * Außerhalb Fenster → fail (Ampel: block_recommended); Referenzdatum fehlt → warn.
 */
function evaluateStationaerKontextDateWindow(
  extracted: MedicalOcrExtracted,
  rideDay: string,
): { warningCodes: string[]; severity: MedicalDateLogicSeverity; details: Record<string, unknown> } {
  const warningCodes: string[] = [];
  let severity: MedicalDateLogicSeverity = "ok";
  const details: Record<string, unknown> = {
    behandlungsKontext: extracted.behandlungsKontext,
    rideDay,
    aufnahmedatum: extracted.aufnahmedatum,
    entlassungsdatum: extracted.entlassungsdatum,
  };

  if (extracted.behandlungsKontext === "vorstationaer") {
    const admission = extracted.aufnahmedatum;
    if (!admission) {
      warningCodes.push("vorstationaer_missing_aufnahmedatum");
      severity = mergeDateLogicSeverity(severity, "warn");
    } else {
      const diff = dayDiff(rideDay, admission);
      details.vorstationaerDayDiff = diff;
      if (diff == null || diff < -VORSTATIONAER_MAX_DAYS_BEFORE_ADMISSION || diff > 0) {
        warningCodes.push("vorstationaer_outside_window");
        severity = mergeDateLogicSeverity(severity, "fail");
      }
    }
  }

  if (extracted.behandlungsKontext === "nachstationaer") {
    const discharge = extracted.entlassungsdatum;
    if (!discharge) {
      warningCodes.push("nachstationaer_missing_entlassungsdatum");
      severity = mergeDateLogicSeverity(severity, "warn");
    } else {
      const diff = dayDiff(rideDay, discharge);
      details.nachstationaerDayDiff = diff;
      if (diff == null || diff < 0 || diff > NACHSTATIONAER_MAX_DAYS_AFTER_DISCHARGE) {
        warningCodes.push("nachstationaer_outside_window");
        severity = mergeDateLogicSeverity(severity, "fail");
      }
    }
  }

  return { warningCodes, severity, details };
}

function applyStationaerKontextChecks(
  input: MedicalDateLogicInput,
  rideDay: string,
  warningCodes: string[],
  severity: MedicalDateLogicSeverity,
  details: Record<string, unknown>,
): MedicalDateLogicSeverity {
  const stationaer = evaluateStationaerKontextDateWindow(input.extracted, rideDay);
  warningCodes.push(...stationaer.warningCodes);
  Object.assign(details, { stationaerKontext: stationaer.details });
  return mergeDateLogicSeverity(severity, stationaer.severity);
}

function evaluateToday(input: MedicalDateLogicInput): MedicalDateLogicResult {
  const now = input.now ?? new Date();
  const ride = toDate(input.rideScheduledAt);
  const today = berlinCalendarDay(now);
  const expectedDate = ride ? berlinCalendarDay(ride) : today;
  const { validFrom, validUntil, transportDate } = input.extracted;
  const ocrDate = pickOcrRideDate(input.extracted);
  const warningCodes: string[] = [];
  let severity: MedicalDateLogicSeverity = "ok";

  if (validUntil && validUntil < today) {
    warningCodes.push("validity_expired");
    severity = "fail";
  }
  if (validFrom && today < validFrom) {
    warningCodes.push("validity_not_yet_started");
    severity = "fail";
  }

  if (severity !== "fail") {
    const hasValidUntil = Boolean(validUntil);
    const todayInValidityWindow =
      (!validFrom || validFrom <= today) && (!validUntil || today <= validUntil);

    if (hasValidUntil && todayInValidityWindow) {
      // Heute liegt im Gültigkeitsfenster — Behandlungsdatum muss nicht „heute“ sein.
    } else if (!hasValidUntil) {
      const refDate = transportDate ?? ocrDate;
      if (!refDate) {
        warningCodes.push("missing_ocr_date");
        severity = "warn";
      } else {
        const diff = dayDiff(refDate, today);
        if (diff != null && Math.abs(diff) > 1) {
          warningCodes.push("ride_date_mismatch");
          severity = "fail";
        }
      }
    }
  }

  const details: Record<string, unknown> = {
    rideScheduledAt: ride?.toISOString() ?? null,
    today,
    validFrom,
    validUntil,
    transportDate,
    checkMode: validUntil ? "validity_window" : "transport_date_tolerance",
  };
  severity = applyStationaerKontextChecks(input, expectedDate, warningCodes, severity, details);

  return {
    type: "today",
    passed: severity === "ok",
    severity,
    expectedDate: today,
    ocrDate,
    warningCodes,
    details,
  };
}

function evaluateSeries(input: MedicalDateLogicInput): MedicalDateLogicResult {
  const now = input.now ?? new Date();
  const ride = toDate(input.rideScheduledAt);
  const expectedDate = ride ? berlinCalendarDay(ride) : berlinCalendarDay(now);
  const ocrDate = pickOcrRideDate(input.extracted);
  const warningCodes: string[] = [];
  let severity: MedicalDateLogicSeverity = "ok";
  const series = input.series;

  if (!series?.id) {
    warningCodes.push("missing_series");
    severity = "fail";
  } else {
    const from = normalizeMedicalOcrDate(series.validFrom);
    const until = normalizeMedicalOcrDate(series.validUntil);
    if (from && expectedDate < from) {
      warningCodes.push("series_before_valid_from");
      severity = "fail";
    }
    if (until && expectedDate > until) {
      warningCodes.push("series_after_valid_until");
      severity = "fail";
    }
    const completed = series.completedRides ?? 0;
    if (series.totalRides > 0 && completed >= series.totalRides) {
      warningCodes.push("series_quota_exhausted");
      severity = severity === "fail" ? "fail" : "warn";
    }
  }

  if (!ocrDate) {
    warningCodes.push("missing_ocr_date");
    if (severity !== "fail") severity = "warn";
  } else if (ocrDate !== expectedDate && severity !== "fail") {
    warningCodes.push("ride_date_mismatch");
    severity = "warn";
  }

  const details: Record<string, unknown> = {
    seriesId: series?.id ?? null,
    validFrom: series ? normalizeMedicalOcrDate(series.validFrom) : null,
    validUntil: series ? normalizeMedicalOcrDate(series.validUntil) : null,
    totalRides: series?.totalRides ?? null,
    completedRides: series?.completedRides ?? null,
  };
  severity = applyStationaerKontextChecks(input, expectedDate, warningCodes, severity, details);

  return {
    type: "series",
    passed: severity === "ok",
    severity,
    expectedDate,
    ocrDate,
    warningCodes,
    details,
  };
}

function evaluateReturnTrip(input: MedicalDateLogicInput): MedicalDateLogicResult {
  const ride = toDate(input.rideScheduledAt);
  const returnRide = toDate(input.returnRideScheduledAt);
  const expectedDate = ride ? berlinCalendarDay(ride) : null;
  const ocrDate = pickOcrRideDate(input.extracted);
  const warningCodes: string[] = [];
  let severity: MedicalDateLogicSeverity = "ok";

  if (!returnRide) {
    warningCodes.push("missing_return_ride");
    severity = "warn";
  } else if (ride) {
    const outboundDay = berlinCalendarDay(ride);
    const returnDay = berlinCalendarDay(returnRide);
    const diff = dayDiff(returnDay, outboundDay);
    if (diff != null && (diff < 0 || diff > 14)) {
      warningCodes.push("return_trip_date_implausible");
      severity = "fail";
    }
  }

  if (!ocrDate) {
    warningCodes.push("missing_ocr_date");
    if (severity !== "fail") severity = "warn";
  } else if (expectedDate && ocrDate !== expectedDate && severity !== "fail") {
    warningCodes.push("ride_date_mismatch");
    severity = "warn";
  }

  const details: Record<string, unknown> = {
    returnRideScheduledAt: returnRide?.toISOString() ?? null,
  };
  if (expectedDate) {
    severity = applyStationaerKontextChecks(input, expectedDate, warningCodes, severity, details);
  }

  return {
    type: "return_trip",
    passed: severity === "ok",
    severity,
    expectedDate,
    ocrDate,
    warningCodes,
    details,
  };
}

function evaluateLongTermTreatment(input: MedicalDateLogicInput): MedicalDateLogicResult {
  const now = input.now ?? new Date();
  const today = berlinCalendarDay(now);
  const ride = toDate(input.rideScheduledAt);
  const expectedDate = ride ? berlinCalendarDay(ride) : today;
  const ocrDate = pickOcrRideDate(input.extracted);
  const validFrom = input.extracted.validFrom;
  const validUntil = input.extracted.validUntil;
  const warningCodes: string[] = [];
  let severity: MedicalDateLogicSeverity = "ok";

  if (!validFrom && !validUntil) {
    warningCodes.push("missing_validity_window");
    severity = "warn";
  }

  if (validUntil && validUntil < today) {
    warningCodes.push("validity_expired");
    severity = "fail";
  }

  if (validFrom && expectedDate < validFrom) {
    warningCodes.push("ride_before_valid_from");
    severity = "fail";
  }

  if (validUntil && expectedDate > validUntil) {
    warningCodes.push("ride_after_valid_until");
    severity = "fail";
  }

  const series = input.series;
  if (series?.id) {
    const sUntil = normalizeMedicalOcrDate(series.validUntil);
    if (sUntil && expectedDate > sUntil) {
      warningCodes.push("series_window_exceeded");
      severity = "fail";
    }
  }

  if (!ocrDate) {
    warningCodes.push("missing_ocr_date");
    if (severity !== "fail") severity = "warn";
  }

  const details: Record<string, unknown> = {
    validFrom,
    validUntil,
    seriesId: series?.id ?? null,
  };
  severity = applyStationaerKontextChecks(input, expectedDate, warningCodes, severity, details);

  return {
    type: "long_term_treatment",
    passed: severity === "ok",
    severity,
    expectedDate,
    ocrDate,
    warningCodes,
    details,
  };
}

/** Datumslogik für die vier Phase-1-Falltypen (Europe/Berlin). */
export function evaluateMedicalDateLogic(input: MedicalDateLogicInput): MedicalDateLogicResult {
  switch (input.dateLogicType) {
    case "series":
      return evaluateSeries(input);
    case "return_trip":
      return evaluateReturnTrip(input);
    case "long_term_treatment":
      return evaluateLongTermTreatment(input);
    case "today":
    default:
      return evaluateToday(input);
  }
}
