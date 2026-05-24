/**
 * Krankenkassen-Regel-Engine — Grundstruktur für spätere Kassenprofile.
 * Keine Diagnose, keine ICD-Codes, keine Zahlungsgarantie — nur ONRODA-Vorprüfung.
 */

import type { MedicalOcrExtracted } from "./medicalOcrNormalize";

export const MEDICAL_INSURANCE_PROFILES = [
  "AOK_BW",
  "VDEK_STANDARD",
  "PRIVATE",
  "UNKNOWN",
] as const;

export type MedicalInsuranceProfileId = (typeof MEDICAL_INSURANCE_PROFILES)[number];

export type MedicalInsuranceRuleResult = {
  profile: MedicalInsuranceProfileId;
  title: string;
  summary: string;
  warnings: string[];
  requiredFields: string[];
  manualReviewRequired: boolean;
  detectedInsuranceName: string;
  detectedInsuranceIk: string;
};

export type MedicalCompanyProfile = {
  companyId: string;
  partnerIkNumber: string;
};

export type MedicalInsuranceRideContext = {
  rideId: string;
  scheduledAt: string | null;
  dateLogicType: string;
};

type ProfileDefinition = {
  id: MedicalInsuranceProfileId;
  displayTitle: string;
  summaryTemplate: string;
  requiredFields: (keyof MedicalOcrExtracted)[];
  /** Basis-Profil erfordert immer manuelle Nachprüfung, bis Kassenregeln hinterlegt sind. */
  defaultManualReview: boolean;
};

const PROFILE_DEFINITIONS: Record<MedicalInsuranceProfileId, ProfileDefinition> = {
  AOK_BW: {
    id: "AOK_BW",
    displayTitle: "Profil AOK Baden-Württemberg (Basis)",
    summaryTemplate:
      "Erkanntes AOK-BW-Nähe-Profil. Es sind noch keine finalen AOK-Fachregeln hinterlegt — nur strukturelle ONRODA-Vorprüfung.",
    requiredFields: ["insuranceName", "insuranceIk", "transportDate", "patientReference"],
    defaultManualReview: true,
  },
  VDEK_STANDARD: {
    id: "VDEK_STANDARD",
    displayTitle: "Profil GKV / vdek-Standard (Basis)",
    summaryTemplate:
      "Erkanntes gesetzliches Krankenkassen-Profil (vdek-Nähe). Konkrete Kassenregeln (TK, DAK, Barmer …) folgen in späteren Schritten.",
    requiredFields: ["insuranceName", "insuranceIk", "transportDate"],
    defaultManualReview: true,
  },
  PRIVATE: {
    id: "PRIVATE",
    displayTitle: "Profil Privat / PKV / Beihilfe (Basis)",
    summaryTemplate:
      "Hinweis auf private oder beihilfe-nahe Abrechnung. Keine GKV-Sonderregeln — manuelle Prüfung der Abrechnungsunterlagen empfohlen.",
    requiredFields: ["insuranceName", "transportDate"],
    defaultManualReview: true,
  },
  UNKNOWN: {
    id: "UNKNOWN",
    displayTitle: "Profil unbekannt",
    summaryTemplate:
      "Krankenkasse konnte nicht sicher zugeordnet werden. Bitte Transportschein manuell prüfen, bevor die Fahrt abgerechnet wird.",
    requiredFields: ["insuranceName", "insuranceIk", "transportDate"],
    defaultManualReview: true,
  },
};

const FIELD_LABELS_DE: Partial<Record<keyof MedicalOcrExtracted, string>> = {
  insuranceName: "Name der Krankenkasse",
  insuranceIk: "IK der Krankenkasse",
  transportDate: "Fahrtdatum auf dem Schein",
  patientReference: "Versicherten-Nr. / Kostenträgerkennung",
  validFrom: "Gültig ab",
  validUntil: "Gültig bis",
  genehmigungsnummer: "Genehmigungsnummer",
  partnerIkNumber: "Partner-IK (Unternehmen)",
};

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeIk(value: string): string {
  return value.replace(/\D/g, "").slice(0, 9);
}

function hasMeaningfulString(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isPrivateInsuranceHint(nameNorm: string): boolean {
  return (
    nameNorm.includes("privat") ||
    nameNorm.includes("pkv") ||
    nameNorm.includes("beihilfe") ||
    nameNorm.includes("private kranken") ||
    nameNorm.includes("krankenversicherung privat")
  );
}

function isAokBwHint(nameNorm: string): boolean {
  if (!nameNorm.includes("aok")) return false;
  return (
    nameNorm.includes("baden") ||
    nameNorm.includes("wurttemberg") ||
    nameNorm.includes(" wurtt") ||
    /\baok\s*bw\b/.test(nameNorm) ||
    nameNorm.includes("aok bw")
  );
}

function isStatutoryInsuranceHint(nameNorm: string, ik: string): boolean {
  if (ik.length === 9 && /^10[89]/.test(ik)) return true;
  const statutoryTokens = [
    "krankenkasse",
    "kasse",
    "bkk",
    "ikk",
    "tk ",
    "techniker",
    "dak",
    "barmer",
    "hkk",
    "kkh",
    "huk",
    "aok",
    "vdek",
    "knappschaft",
    "mobil",
    "sbk",
    "hek",
    "big",
  ];
  return statutoryTokens.some((token) => nameNorm.includes(token));
}

/**
 * Ordnet OCR-KK-Hinweise einem Basis-Profil zu — noch ohne harte Kassenregeln.
 */
export function resolveMedicalInsuranceProfile(
  insuranceName: string,
  insuranceIk: string,
): MedicalInsuranceProfileId {
  const nameNorm = normalizeText(insuranceName);
  const ik = normalizeIk(insuranceIk);

  if (isPrivateInsuranceHint(nameNorm)) {
    return "PRIVATE";
  }
  if (isAokBwHint(nameNorm)) {
    return "AOK_BW";
  }
  if (nameNorm.length > 0 || ik.length > 0) {
    if (isStatutoryInsuranceHint(nameNorm, ik)) {
      return "VDEK_STANDARD";
    }
  }
  return "UNKNOWN";
}

function fieldPresent(extracted: MedicalOcrExtracted, field: keyof MedicalOcrExtracted): boolean {
  const value = extracted[field];
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function missingFieldWarnings(
  extracted: MedicalOcrExtracted,
  requiredFields: (keyof MedicalOcrExtracted)[],
): string[] {
  const warnings: string[] = [];
  for (const field of requiredFields) {
    if (!fieldPresent(extracted, field)) {
      const label = FIELD_LABELS_DE[field] ?? field;
      warnings.push(`Pflichtfeld fehlt oder unleserlich: ${label}.`);
    }
  }
  return warnings;
}

function partnerIkWarning(extracted: MedicalOcrExtracted, companyProfile: MedicalCompanyProfile): string | null {
  const partnerIk = companyProfile.partnerIkNumber.trim();
  if (!partnerIk) return null;
  const ocrPartnerIk = extracted.partnerIkNumber.trim();
  if (!ocrPartnerIk) return null;
  if (normalizeIk(ocrPartnerIk) !== normalizeIk(partnerIk)) {
    return "Partner-IK auf dem Schein weicht vom Unternehmens-IK ab — bitte manuell prüfen.";
  }
  return null;
}

/**
 * Wendet das Basis-Profil auf normalisierte OCR-Daten an.
 * Erweiterungspunkt für spätere kassenspezifische Regeln.
 */
export function evaluateMedicalInsuranceRules(
  normalizedOcr: MedicalOcrExtracted,
  companyProfile: MedicalCompanyProfile,
  rideContext: MedicalInsuranceRideContext,
): MedicalInsuranceRuleResult {
  const detectedInsuranceName = normalizedOcr.insuranceName.trim();
  const detectedInsuranceIk = normalizedOcr.insuranceIk.trim();
  const profile = resolveMedicalInsuranceProfile(detectedInsuranceName, detectedInsuranceIk);
  const def = PROFILE_DEFINITIONS[profile];

  const warnings = missingFieldWarnings(normalizedOcr, def.requiredFields);

  if (!detectedInsuranceName && !detectedInsuranceIk) {
    warnings.push("Keine Krankenkasse auf dem Transportschein erkannt.");
  }

  const partnerWarn = partnerIkWarning(normalizedOcr, companyProfile);
  if (partnerWarn) warnings.push(partnerWarn);

  if (profile === "UNKNOWN") {
    warnings.push("Profilzuordnung unsicher — keine automatische Kassenregel anwendbar.");
  }

  if (!rideContext.scheduledAt && rideContext.dateLogicType === "today") {
    warnings.push("Keine geplante Abholzeit in der Fahrt hinterlegt — Datumsabgleich eingeschränkt.");
  }

  const manualReviewRequired =
    def.defaultManualReview || warnings.length > 0 || profile === "UNKNOWN";

  return {
    profile,
    title: `ONRODA-Vorprüfung — ${def.displayTitle}`,
    summary: def.summaryTemplate,
    warnings,
    requiredFields: def.requiredFields.map((f) => FIELD_LABELS_DE[f] ?? String(f)),
    manualReviewRequired,
    detectedInsuranceName,
    detectedInsuranceIk,
  };
}
