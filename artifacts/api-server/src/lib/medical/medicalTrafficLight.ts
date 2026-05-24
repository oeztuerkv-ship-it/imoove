import type { MedicalDateLogicResult } from "./medicalDateLogic";
import type { MedicalOcrConfidence, MedicalOcrExtracted } from "./medicalOcrNormalize";
import {
  hasGenehmigungsnummer,
  isAmbulantGenehmigungsfrei,
  medicalOcrHasMinimalExtract,
} from "./medicalOcrNormalize";

export const MEDICAL_TRAFFIC_LIGHTS = ["green", "yellow", "red"] as const;
export type MedicalTrafficLight = (typeof MEDICAL_TRAFFIC_LIGHTS)[number];

export const MEDICAL_WARNING_SEVERITIES = ["info", "warn", "block_recommended"] as const;
export type MedicalWarningSeverity = (typeof MEDICAL_WARNING_SEVERITIES)[number];

export type MedicalWarning = {
  code: string;
  message: string;
  severity: MedicalWarningSeverity;
};

export type MedicalTrafficLightInput = {
  extracted: MedicalOcrExtracted;
  confidence: MedicalOcrConfidence;
  partnerIkSnapshot: string;
  dateLogicResult: MedicalDateLogicResult;
  ocrProviderSucceeded?: boolean;
  /** Patientenunterschrift auf dem Schein erkannt (optional, Phase 1 oft unbekannt). */
  hasSignatureOnDocument?: boolean;
};

export type MedicalTrafficLightResult = {
  trafficLight: MedicalTrafficLight;
  warnings: MedicalWarning[];
};

const CONFIDENCE_WARN_THRESHOLD = 0.55;

const DATE_LOGIC_MESSAGES: Record<string, string> = {
  missing_ocr_date: "Fahrtdatum auf dem Schein nicht erkannt",
  ride_date_mismatch: "Fahrtdatum weicht von der geplanten Fahrt ab",
  missing_series: "Serienfahrt nicht zugeordnet",
  series_before_valid_from: "Fahrt liegt vor Serien-Beginn",
  series_after_valid_until: "Fahrt liegt nach Serien-Ende",
  series_quota_exhausted: "Serien-Kontingent ausgeschöpft",
  missing_return_ride: "Rückfahrt nicht verknüpft",
  return_trip_date_implausible: "Rückfahrt-Datum nicht plausibel",
  missing_validity_window: "Gültigkeitszeitraum auf dem Schein unklar",
  validity_expired: "Schein abgelaufen",
  ride_before_valid_from: "Fahrt vor Gültigkeitsbeginn",
  ride_after_valid_until: "Fahrt nach Gültigkeitsende",
  series_window_exceeded: "Fahrt außerhalb Serien-Zeitraum",
};

function dateLogicSeverityToWarning(severity: MedicalDateLogicResult["severity"]): MedicalWarningSeverity {
  if (severity === "fail") return "block_recommended";
  if (severity === "warn") return "warn";
  return "info";
}

function maxTrafficLight(a: MedicalTrafficLight, b: MedicalTrafficLight): MedicalTrafficLight {
  const rank: Record<MedicalTrafficLight, number> = { green: 0, yellow: 1, red: 2 };
  return rank[b] > rank[a] ? b : a;
}

function trafficLightFromWarnings(warnings: MedicalWarning[]): MedicalTrafficLight {
  if (warnings.some((w) => w.severity === "block_recommended")) return "red";
  if (warnings.some((w) => w.severity === "warn")) return "yellow";
  return "green";
}

function hasTransportDate(extracted: MedicalOcrExtracted): boolean {
  return Boolean(extracted.transportDate || extracted.validFrom);
}

/** Ambulant/stationär-Regeln (Genehmigungsfreiheit, KK-Genehmigungsnummer). */
function evaluateBehandlungsArtRules(
  extracted: MedicalOcrExtracted,
  input: MedicalTrafficLightInput,
): MedicalWarning[] {
  const warnings: MedicalWarning[] = [];
  const art = extracted.behandlungsArt;

  if (art === "unbekannt") {
    warnings.push({
      code: "behandlungsart_unbekannt",
      message: "Ambulant oder stationär nicht eindeutig erkennbar",
      severity: "warn",
    });
    return warnings;
  }

  if (art === "stationaer") {
    if (!hasTransportDate(extracted)) {
      warnings.push({
        code: "stationaer_missing_date",
        message: "Stationär: Fahrtdatum auf dem Schein fehlt",
        severity: "warn",
      });
    }
    if (!input.partnerIkSnapshot.trim()) {
      warnings.push({
        code: "stationaer_missing_taxi_ik",
        message: "Stationär: Leistungserbringer-IK (Taxi) nicht erkennbar",
        severity: "warn",
      });
    }
    if (input.hasSignatureOnDocument === false) {
      warnings.push({
        code: "stationaer_missing_signature",
        message: "Stationär: Unterschrift auf dem Schein nicht erkennbar",
        severity: "warn",
      });
    }
    if (
      hasTransportDate(extracted) &&
      input.partnerIkSnapshot.trim() &&
      input.hasSignatureOnDocument !== false
    ) {
      warnings.push({
        code: "stationaer_checks_ok",
        message: "Stationär: Datum, Taxi-IK und Unterschrift — keine KK-Genehmigungsnummer nötig",
        severity: "info",
      });
    }
    return warnings;
  }

  // ambulant
  if (isAmbulantGenehmigungsfrei(extracted)) {
    warnings.push({
      code: "ambulant_genehmigungsfrei",
      message: "Ambulant genehmigungsfrei (Pflegegrad 3/4/5 oder Merkzeichen aG/Bl/H)",
      severity: "info",
    });
    return warnings;
  }

  if (!hasGenehmigungsnummer(extracted)) {
    warnings.push({
      code: "missing_genehmigungsnummer",
      message: "Ambulant ohne Pflegegrad/Merkzeichen: Genehmigungsnummer der Krankenkasse fehlt",
      severity: "block_recommended",
    });
    return warnings;
  }

  warnings.push({
    code: "ambulant_genehmigungsnummer_ok",
    message: "Ambulant: Genehmigungsnummer der Krankenkasse erkannt",
    severity: "info",
  });
  return warnings;
}

/**
 * Ampel-Regelwerk Phase 1 — nur Empfehlung, keine Auto-Freigabe.
 * Rot = Ablehnen empfohlen; Gelb = mit Warnung weiter möglich.
 */
export function evaluateMedicalTrafficLight(input: MedicalTrafficLightInput): MedicalTrafficLightResult {
  const warnings: MedicalWarning[] = [];
  const { extracted, confidence, dateLogicResult } = input;
  const ocrOk = input.ocrProviderSucceeded !== false;

  if (!ocrOk) {
    warnings.push({
      code: "ocr_failed",
      message: "OCR-Auswertung fehlgeschlagen",
      severity: "block_recommended",
    });
  }

  if (!medicalOcrHasMinimalExtract(extracted)) {
    warnings.push({
      code: "ocr_no_fields",
      message: "Keine auswertbaren Felder erkannt",
      severity: "block_recommended",
    });
  }

  warnings.push(...evaluateBehandlungsArtRules(extracted, input));

  for (const code of dateLogicResult.warningCodes) {
    warnings.push({
      code,
      message: DATE_LOGIC_MESSAGES[code] ?? `Datumsprüfung: ${code}`,
      severity: dateLogicSeverityToWarning(dateLogicResult.severity),
    });
  }

  if (!extracted.insuranceName.trim()) {
    warnings.push({
      code: "missing_insurance_name",
      message: "Krankenkasse nicht erkannt",
      severity: "warn",
    });
  }

  if (!extracted.insuranceIk.trim()) {
    warnings.push({
      code: "missing_insurance_ik",
      message: "Kassen-IK nicht erkannt",
      severity: "warn",
    });
  }

  if (!input.partnerIkSnapshot.trim()) {
    warnings.push({
      code: "missing_partner_ik",
      message: "Leistungserbringer-IK (Unternehmen) nicht hinterlegt",
      severity: "warn",
    });
  }

  for (const field of [
    "insuranceIk",
    "transportDate",
    "behandlungsArt",
    "genehmigungsnummer",
  ] as const) {
    const c = confidence[field];
    if (typeof c === "number" && c < CONFIDENCE_WARN_THRESHOLD) {
      warnings.push({
        code: `low_confidence_${field}`,
        message: `Unsichere Erkennung: ${field}`,
        severity: "warn",
      });
    }
  }

  if (!extracted.transportDate && !extracted.validFrom && !extracted.validUntil) {
    warnings.push({
      code: "missing_date_fields",
      message: "Kein Datum auf dem Schein erkannt",
      severity: "warn",
    });
  }

  const trafficLight = trafficLightFromWarnings(warnings);

  return { trafficLight, warnings };
}

/** Aggregiert mehrere Ampel-Stufen (z. B. für spätere Mehrfach-Reviews). */
export function mergeMedicalTrafficLights(lights: MedicalTrafficLight[]): MedicalTrafficLight {
  return lights.reduce<MedicalTrafficLight>((acc, cur) => maxTrafficLight(acc, cur), "green");
}
