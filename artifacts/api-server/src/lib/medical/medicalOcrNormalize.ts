/**
 * Normalisiert OCR-Rohdaten (Claude Vision oder andere Provider) in abrechnungsrelevante Felder.
 * Keine Diagnose — nur Transportschein-/Abrechnungsfelder.
 */

export const MEDICAL_OCR_EXTRACTED_FIELDS = [
  "patientDisplayName",
  "patientReference",
  "insuranceName",
  "insuranceIk",
  "partnerIkNumber",
  "transportDate",
  "validFrom",
  "validUntil",
  "documentKind",
  "behandlungsArt",
  "pflegegrad",
  "merkzeichen",
  "genehmigungsnummer",
] as const;

export type MedicalOcrDocumentKind = "transport_sheet" | "signature_image" | "other";
export type MedicalBehandlungsArt = "stationaer" | "ambulant" | "unbekannt";
export type MedicalPflegegrad = "3" | "4" | "5" | "keins" | "unbekannt";
export type MedicalMerkzeichen = "aG" | "Bl" | "H" | "keins" | "unbekannt";

export type MedicalOcrExtracted = {
  patientDisplayName: string;
  patientReference: string;
  insuranceName: string;
  insuranceIk: string;
  partnerIkNumber: string;
  transportDate: string | null;
  validFrom: string | null;
  validUntil: string | null;
  documentKind: MedicalOcrDocumentKind;
  behandlungsArt: MedicalBehandlungsArt;
  pflegegrad: MedicalPflegegrad;
  merkzeichen: MedicalMerkzeichen;
  genehmigungsnummer: string | null;
};

export type MedicalOcrConfidence = Partial<Record<(typeof MEDICAL_OCR_EXTRACTED_FIELDS)[number], number>>;

const EMPTY_EXTRACTED: MedicalOcrExtracted = {
  patientDisplayName: "",
  patientReference: "",
  insuranceName: "",
  insuranceIk: "",
  partnerIkNumber: "",
  transportDate: null,
  validFrom: null,
  validUntil: null,
  documentKind: "transport_sheet",
  behandlungsArt: "unbekannt",
  pflegegrad: "unbekannt",
  merkzeichen: "unbekannt",
  genehmigungsnummer: null,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function pickString(raw: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function normalizeIk(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 9);
}

/** ISO-Kalendertag YYYY-MM-DD oder null. */
export function normalizeMedicalOcrDate(raw: unknown): string | null {
  if (raw == null) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (de) {
    const dd = de[1]!.padStart(2, "0");
    const mm = de[2]!.padStart(2, "0");
    return `${de[3]}-${mm}-${dd}`;
  }

  const t = Date.parse(s);
  if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

function parseDocumentKind(raw: string): MedicalOcrDocumentKind {
  const v = raw.trim().toLowerCase();
  if (v === "signature_image" || v === "signature") return "signature_image";
  if (v === "other") return "other";
  return "transport_sheet";
}

export function parseMedicalBehandlungsArt(raw: unknown): MedicalBehandlungsArt {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
  if (!v || v === "unbekannt" || v === "unknown") return "unbekannt";
  if (
    v === "ambulant" ||
    v.includes("ambulant") ||
    v === "outpatient"
  ) {
    return "ambulant";
  }
  if (
    v === "stationaer" ||
    v === "stationär" ||
    v.includes("stationaer") ||
    v.includes("stationar") ||
    v === "inpatient"
  ) {
    return "stationaer";
  }
  return "unbekannt";
}

export function parseMedicalPflegegrad(raw: unknown): MedicalPflegegrad {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!v || v === "unbekannt" || v === "unknown") return "unbekannt";
  if (v === "keins" || v === "keine" || v === "none" || v === "0" || v === "nein") return "keins";
  const digit = v.match(/\b([345])\b/)?.[1];
  if (digit === "3" || digit === "4" || digit === "5") return digit;
  return "unbekannt";
}

export function parseMedicalMerkzeichen(raw: unknown): MedicalMerkzeichen {
  const v = String(raw ?? "").trim();
  if (!v || v.toLowerCase() === "unbekannt" || v.toLowerCase() === "unknown") return "unbekannt";
  if (v.toLowerCase() === "keins" || v.toLowerCase() === "keine" || v.toLowerCase() === "none") return "keins";

  const compact = v.replace(/\s+/g, "");
  if (/^aG$/i.test(compact) || compact.toLowerCase() === "ag") return "aG";
  if (/^Bl$/i.test(compact) || compact.toLowerCase() === "bl") return "Bl";
  if (compact === "H" || compact.toLowerCase() === "h") return "H";

  const upper = v.toUpperCase();
  if (upper.includes("AG") && !upper.includes("BL")) return "aG";
  if (upper.includes("BL")) return "Bl";
  if (/\bH\b/.test(v)) return "H";

  return "unbekannt";
}

export function normalizeGenehmigungsnummer(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === "null" || s.toLowerCase() === "unbekannt") return null;
  return s.slice(0, 64);
}

/** Pflegegrad 3/4/5 oder Merkzeichen aG/Bl/H → ambulant genehmigungsfrei. */
export function isAmbulantGenehmigungsfrei(extracted: MedicalOcrExtracted): boolean {
  if (extracted.pflegegrad === "3" || extracted.pflegegrad === "4" || extracted.pflegegrad === "5") {
    return true;
  }
  if (extracted.merkzeichen === "aG" || extracted.merkzeichen === "Bl" || extracted.merkzeichen === "H") {
    return true;
  }
  return false;
}

export function hasGenehmigungsnummer(extracted: MedicalOcrExtracted): boolean {
  return Boolean(extracted.genehmigungsnummer?.trim());
}

/** Optional aus OCR-Roh-JSON (Claude-Feld `hasSignatureOnDocument`). */
export function parseHasSignatureOnDocument(raw: unknown): boolean | undefined {
  if (!isRecord(raw)) return undefined;
  const nested = isRecord(raw.extracted) ? raw.extracted : raw;
  if (typeof nested.hasSignatureOnDocument === "boolean") return nested.hasSignatureOnDocument;
  if (typeof nested.has_signature_on_document === "boolean") return nested.has_signature_on_document;
  return undefined;
}

function pickConfidence(raw: Record<string, unknown>): MedicalOcrConfidence {
  const out: MedicalOcrConfidence = {};
  const conf = raw.confidence ?? raw.confidences ?? raw.field_confidence;
  const source = isRecord(conf) ? conf : raw;
  if (!isRecord(source)) return out;
  for (const field of MEDICAL_OCR_EXTRACTED_FIELDS) {
    const v = source[field];
    if (typeof v === "number" && Number.isFinite(v)) {
      out[field] = Math.max(0, Math.min(1, v));
    }
  }
  return out;
}

/**
 * Mappt Provider-Roh-JSON auf `ocr_extracted_json` + Confidences.
 * Akzeptiert bereits normalisierte Objekte oder verschachtelte `extracted`/`fields`-Blöcke.
 */
export function normalizeMedicalOcrPayload(raw: unknown): {
  extracted: MedicalOcrExtracted;
  confidence: MedicalOcrConfidence;
} {
  if (!isRecord(raw)) {
    return { extracted: { ...EMPTY_EXTRACTED }, confidence: {} };
  }

  const nested = isRecord(raw.extracted)
    ? raw.extracted
    : isRecord(raw.fields)
      ? raw.fields
      : raw;

  const patientDisplayName = pickString(nested, [
    "patientDisplayName",
    "patient_display_name",
    "patientName",
    "patient_name",
    "name",
  ]).slice(0, 200);

  const patientReference = pickString(nested, [
    "patientReference",
    "patient_reference",
    "patientId",
    "patient_id",
    "versichertennummer",
  ]).slice(0, 120);

  const insuranceName = pickString(nested, [
    "insuranceName",
    "insurance_name",
    "krankenkasse",
    "kasse",
    "health_insurance",
  ]).slice(0, 200);

  const insuranceIkRaw = pickString(nested, [
    "insuranceIk",
    "insurance_ik",
    "kassenIk",
    "kassen_ik",
    "kk_ik",
  ]);
  const insuranceIk = normalizeIk(insuranceIkRaw);

  const partnerIkRaw = pickString(nested, [
    "partnerIkNumber",
    "partner_ik_number",
    "leistungserbringerIk",
    "leistungserbringer_ik",
    "provider_ik",
  ]);
  const partnerIkNumber = normalizeIk(partnerIkRaw);

  const transportDate = normalizeMedicalOcrDate(
    nested.transportDate ?? nested.transport_date ?? nested.fahrtdatum ?? nested.ride_date ?? nested.date,
  );
  const validFrom = normalizeMedicalOcrDate(
    nested.validFrom ?? nested.valid_from ?? nested.gueltig_ab ?? nested.gueltigAb,
  );
  const validUntil = normalizeMedicalOcrDate(
    nested.validUntil ?? nested.valid_until ?? nested.gueltig_bis ?? nested.gueltigBis,
  );

  const documentKind = parseDocumentKind(
    pickString(nested, ["documentKind", "document_kind", "documentType", "document_type"]),
  );

  const behandlungsArt = parseMedicalBehandlungsArt(
    nested.behandlungsArt ??
      nested.behandlungs_art ??
      nested.behandlungsart ??
      nested.treatmentType ??
      nested.treatment_type,
  );

  const pflegegrad = parseMedicalPflegegrad(
    nested.pflegegrad ?? nested.pflegegrad_level ?? nested.careLevel ?? nested.care_level,
  );

  const merkzeichen = parseMedicalMerkzeichen(
    nested.merkzeichen ?? nested.merkzeichen_code ?? nested.disabilityMark ?? nested.disability_mark,
  );

  const genehmigungsnummer = normalizeGenehmigungsnummer(
    nested.genehmigungsnummer ??
      nested.genehmigungs_nummer ??
      nested.approvalNumber ??
      nested.approval_number ??
      nested.kk_genehmigungsnummer,
  );

  const confidence = pickConfidence(raw);

  return {
    extracted: {
      patientDisplayName,
      patientReference,
      insuranceName,
      insuranceIk,
      partnerIkNumber,
      transportDate,
      validFrom,
      validUntil,
      documentKind,
      behandlungsArt,
      pflegegrad,
      merkzeichen,
      genehmigungsnummer,
    },
    confidence,
  };
}

/** Prüft, ob mindestens ein abrechnungsrelevantes Feld erkannt wurde. */
export function medicalOcrHasMinimalExtract(extracted: MedicalOcrExtracted): boolean {
  return Boolean(
    extracted.insuranceName ||
      extracted.insuranceIk ||
      extracted.partnerIkNumber ||
      extracted.transportDate ||
      extracted.validFrom ||
      extracted.validUntil ||
      extracted.patientDisplayName ||
      extracted.patientReference ||
      extracted.behandlungsArt !== "unbekannt" ||
      extracted.genehmigungsnummer,
  );
}
