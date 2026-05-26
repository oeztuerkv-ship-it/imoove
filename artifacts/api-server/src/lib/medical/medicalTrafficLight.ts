import type { MedicalDateLogicResult } from "./medicalDateLogic";
import type { MedicalOcrConfidence, MedicalOcrExtracted } from "./medicalOcrNormalize";
import {
  hasGenehmigungsnummer,
  isAmbulantGenehmigungsfrei,
  isAmbulantGenehmigungsfreiPg3,
  isAmbulantGenehmigungsfreiPg45,
  isAmbulantGenehmigungsfreiMerkzeichen,
  isHochfrequenteBehandlung,
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
  /**
   * Kunden-Scan vor Buchung: Partner-IK kommt vom Taxiunternehmen, nicht vom Schein —
   * keine Leistungserbringer-/Partner-IK-Warnungen.
   */
  omitPartnerIkWarnings?: boolean;
};

export type MedicalTrafficLightResult = {
  trafficLight: MedicalTrafficLight;
  warnings: MedicalWarning[];
};

const CONFIDENCE_WARN_THRESHOLD = 0.55;

/** DE-Texte für Datumslogik-Warnungen (inkl. Vor-/Nachstationär, Schritt 2). */
export const MEDICAL_DATE_LOGIC_MESSAGES_DE: Record<string, string> = {
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
  validity_not_yet_started: "Schein noch nicht gültig",
  ride_before_valid_from: "Fahrt vor Gültigkeitsbeginn",
  ride_after_valid_until: "Fahrt nach Gültigkeitsende",
  series_window_exceeded: "Fahrt außerhalb Serien-Zeitraum",
  vorstationaer_missing_aufnahmedatum: "Vorstationär: Aufnahmedatum auf dem Schein nicht erkannt",
  nachstationaer_missing_entlassungsdatum: "Nachstationär: Entlassungsdatum auf dem Schein nicht erkannt",
  vorstationaer_outside_window:
    "Vorstationär: Fahrt liegt nicht innerhalb von 3 Tagen vor dem Aufnahmedatum",
  nachstationaer_outside_window:
    "Nachstationär: Fahrt liegt nicht innerhalb von 7 Tagen nach dem Entlassungsdatum",
  customer_missing_signature:
    "Bitte Fahrer zeigen — Unterschrift und Stempel vor Ort prüfen",
};

const DATE_LOGIC_CODE_SEVERITY: Record<string, MedicalWarningSeverity> = {
  vorstationaer_missing_aufnahmedatum: "warn",
  nachstationaer_missing_entlassungsdatum: "warn",
  missing_ocr_date: "warn",
  missing_return_ride: "warn",
  missing_validity_window: "warn",
  series_quota_exhausted: "warn",
  vorstationaer_outside_window: "block_recommended",
  nachstationaer_outside_window: "block_recommended",
  ride_date_mismatch: "block_recommended",
  missing_series: "block_recommended",
  series_before_valid_from: "block_recommended",
  series_after_valid_until: "block_recommended",
  return_trip_date_implausible: "block_recommended",
  validity_expired: "block_recommended",
  validity_not_yet_started: "block_recommended",
  ride_before_valid_from: "block_recommended",
  ride_after_valid_until: "block_recommended",
  series_window_exceeded: "block_recommended",
};

export const PG3_GENEHMIGUNG_ERFORDERLICH_HINT_DE =
  "Pflegegrad 3: nur mit dauerhafter Mobilitätsbeeinträchtigung oder Merkzeichen G genehmigungsfrei — KK-Genehmigung prüfen";

/** Kunden-Scan: Unterschrift fehlt → Gelb, Fahrer prüft vor Ort. */
export const CUSTOMER_MISSING_SIGNATURE_HINT_DE =
  "Bitte Fahrer zeigen — Unterschrift und Stempel vor Ort prüfen";

/** §2 Abs. 5 Muster-4 — Fernbehandlung / Videosprechstunde / telefonisch. */
export const FERNBEHANDLUNG_SCHEIN_HINT_DE =
  "Schein per Fernbehandlung ausgestellt — Fahrer prüft Original";

function dateLogicSeverityToWarning(severity: MedicalDateLogicResult["severity"]): MedicalWarningSeverity {
  if (severity === "fail") return "block_recommended";
  if (severity === "warn") return "warn";
  return "info";
}

function warningSeverityForDateLogicCode(
  code: string,
  overall: MedicalDateLogicResult["severity"],
): MedicalWarningSeverity {
  return DATE_LOGIC_CODE_SEVERITY[code] ?? dateLogicSeverityToWarning(overall);
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

function pushMissingSignatureWarning(warnings: MedicalWarning[], input: MedicalTrafficLightInput): void {
  if (input.hasSignatureOnDocument !== false) return;
  if (
    warnings.some(
      (w) => w.code === "stationaer_missing_signature" || w.code === "customer_missing_signature",
    )
  ) {
    return;
  }
  if (input.omitPartnerIkWarnings) {
    warnings.push({
      code: "customer_missing_signature",
      message: CUSTOMER_MISSING_SIGNATURE_HINT_DE,
      severity: "warn",
    });
    return;
  }
  warnings.push({
    code: "stationaer_missing_signature",
    message: "Stationär: Unterschrift auf dem Schein nicht erkennbar",
    severity: "warn",
  });
}

function hasTransportDate(extracted: MedicalOcrExtracted): boolean {
  return Boolean(extracted.transportDate || extracted.validFrom);
}

function hasDauerverordnung(extracted: MedicalOcrExtracted): boolean {
  return Boolean(extracted.validFrom && extracted.validUntil);
}

function hochfrequenteBehandlungLabel(frequenz: MedicalOcrExtracted["behandlungsFrequenz"]): string {
  if (frequenz === "dialyse") return "Dialyse";
  if (frequenz === "chemo") return "Chemotherapie";
  if (frequenz === "strahlen") return "Strahlentherapie";
  return "Hochfrequente Behandlung";
}

/** Dialyse/Chemo/Strahlen: genehmigungspflichtig; PG-Freistellung gilt nicht. */
function evaluateBehandlungsFrequenzRules(extracted: MedicalOcrExtracted): MedicalWarning[] {
  if (!isHochfrequenteBehandlung(extracted)) return [];

  const warnings: MedicalWarning[] = [];
  const label = hochfrequenteBehandlungLabel(extracted.behandlungsFrequenz);

  if (hasGenehmigungsnummer(extracted) || hasDauerverordnung(extracted)) {
    warnings.push({
      code: "hochfrequent_approval_ok",
      message: `${label}: Genehmigung oder Dauerverordnung erkannt — Fahrer prüft vor Ort.`,
      severity: "info",
    });
    return warnings;
  }

  if (extracted.validFrom || extracted.validUntil || extracted.genehmigungsnummer) {
    warnings.push({
      code: "hochfrequent_genehmigung_pruefen",
      message: `${label}: KK-Genehmigung oder Dauerverordnung unvollständig — letzte Entscheidung beim Fahrer.`,
      severity: "warn",
    });
    return warnings;
  }

  warnings.push({
    code: "hochfrequent_missing_approval",
    message: `${label}: Genehmigung der Krankenkasse oder Dauerverordnung fehlt.`,
    severity: "block_recommended",
  });
  return warnings;
}

function ambulantGenehmigungsfreiMessageDe(extracted: MedicalOcrExtracted): string {
  if (isAmbulantGenehmigungsfreiPg3(extracted)) {
    return "Ambulant genehmigungsfrei (Pflegegrad 3 mit dauerhafter Mobilitätsbeeinträchtigung oder Merkzeichen G)";
  }
  if (isAmbulantGenehmigungsfreiPg45(extracted)) {
    return "Ambulant genehmigungsfrei (Pflegegrad 4 oder 5)";
  }
  if (isAmbulantGenehmigungsfreiMerkzeichen(extracted)) {
    return `Ambulant genehmigungsfrei (Merkzeichen ${extracted.merkzeichen})`;
  }
  return "Ambulant genehmigungsfrei";
}

/** Ambulant/stationär-Regeln (Genehmigungsfreiheit, KK-Genehmigungsnummer, Muster-4). */
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
    if (!input.omitPartnerIkWarnings && !input.partnerIkSnapshot.trim()) {
      warnings.push({
        code: "stationaer_missing_taxi_ik",
        message: "Stationär: Leistungserbringer-IK (Taxi) nicht erkennbar",
        severity: "warn",
      });
    }
    if (input.hasSignatureOnDocument === false) {
      pushMissingSignatureWarning(warnings, input);
    }
    const taxiIkSatisfied = input.omitPartnerIkWarnings || Boolean(input.partnerIkSnapshot.trim());
    const signatureOkForStationaerSummary =
      input.omitPartnerIkWarnings || input.hasSignatureOnDocument !== false;
    if (hasTransportDate(extracted) && taxiIkSatisfied && signatureOkForStationaerSummary) {
      warnings.push({
        code: "stationaer_checks_ok",
        message: "Stationär: Datum, Taxi-IK und Unterschrift — keine KK-Genehmigungsnummer nötig",
        severity: "info",
      });
    }
    return warnings;
  }

  // ambulant
  const freqWarnings = evaluateBehandlungsFrequenzRules(extracted);
  warnings.push(...freqWarnings);
  if (freqWarnings.some((w) => w.severity === "block_recommended")) {
    return warnings;
  }
  if (isHochfrequenteBehandlung(extracted)) {
    return warnings;
  }

  if (
    extracted.pflegegrad === "3" &&
    !isAmbulantGenehmigungsfreiPg3(extracted) &&
    !isAmbulantGenehmigungsfreiPg45(extracted) &&
    !isAmbulantGenehmigungsfreiMerkzeichen(extracted)
  ) {
    warnings.push({
      code: "pg3_genehmigung_erforderlich",
      message: PG3_GENEHMIGUNG_ERFORDERLICH_HINT_DE,
      severity: "warn",
    });
    if (!hasGenehmigungsnummer(extracted)) {
      warnings.push({
        code: "missing_genehmigungsnummer",
        message:
          "Pflegegrad 3 ohne Mobilitätsbeeinträchtigung/Merkzeichen G: Genehmigungsnummer der Krankenkasse fehlt",
        severity: "block_recommended",
      });
      return warnings;
    }
    return warnings;
  }

  if (isAmbulantGenehmigungsfrei(extracted)) {
    warnings.push({
      code: "ambulant_genehmigungsfrei",
      message: ambulantGenehmigungsfreiMessageDe(extracted),
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

/** §2 Abs. 5 — Videosprechstunde / telefonisch → Gelb. */
function evaluateFernbehandlungRules(extracted: MedicalOcrExtracted): MedicalWarning[] {
  if (!extracted.fernbehandlungErkannt) return [];
  return [
    {
      code: "fernbehandlung_schein",
      message: FERNBEHANDLUNG_SCHEIN_HINT_DE,
      severity: "warn",
    },
  ];
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
  warnings.push(...evaluateFernbehandlungRules(extracted));

  for (const code of dateLogicResult.warningCodes) {
    warnings.push({
      code,
      message: MEDICAL_DATE_LOGIC_MESSAGES_DE[code] ?? `Datumsprüfung: ${code}`,
      severity: warningSeverityForDateLogicCode(code, dateLogicResult.severity),
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

  if (!input.omitPartnerIkWarnings && !input.partnerIkSnapshot.trim()) {
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
    "behandlungsFrequenz",
    "behandlungsKontext",
    "pflegegrad",
    "merkzeichen",
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

  if (
    !extracted.transportDate &&
    !extracted.validFrom &&
    !extracted.validUntil &&
    !extracted.aufnahmedatum &&
    !extracted.entlassungsdatum
  ) {
    warnings.push({
      code: "missing_date_fields",
      message: "Kein Datum auf dem Schein erkannt",
      severity: "warn",
    });
  }

  if (input.omitPartnerIkWarnings) {
    pushMissingSignatureWarning(warnings, input);
  }

  const trafficLight = trafficLightFromWarnings(warnings);

  return { trafficLight, warnings };
}

/** Aggregiert mehrere Ampel-Stufen (z. B. für spätere Mehrfach-Reviews). */
export function mergeMedicalTrafficLights(lights: MedicalTrafficLight[]): MedicalTrafficLight {
  return lights.reduce<MedicalTrafficLight>((acc, cur) => maxTrafficLight(acc, cur), "green");
}
