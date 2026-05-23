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
] as const;

export type MedicalOcrDocumentKind = "transport_sheet" | "signature_image" | "other";

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

function pickConfidence(raw: Record<string, unknown>): MedicalOcrConfidence {
  const out: MedicalOcrConfidence = {};
  const conf = raw.confidence ?? raw.confidences ?? raw.field_confidence;
  if (!isRecord(conf)) return out;
  for (const field of MEDICAL_OCR_EXTRACTED_FIELDS) {
    const v = conf[field];
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
      extracted.patientReference,
  );
}
