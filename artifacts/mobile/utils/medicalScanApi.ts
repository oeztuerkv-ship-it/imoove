import { getApiBaseUrl } from "./apiBase";

export type MedicalTrafficLight = "green" | "yellow" | "red";

export type MedicalScanWarning = {
  code: string;
  message: string;
  severity: "info" | "warn" | "block_recommended";
};

export type MedicalScanExtracted = {
  patientDisplayName: string;
  patientReference: string;
  insuranceName: string;
  insuranceIk: string;
  partnerIkNumber: string;
  transportDate: string | null;
  validFrom: string | null;
  validUntil: string | null;
  documentKind: string;
  behandlungsArt?: string;
  genehmigungsnummer?: string | null;
};

export type MedicalDateLogicResultDto = {
  type: string;
  passed: boolean;
  severity: string;
  expectedDate: string | null;
  ocrDate: string | null;
  warningCodes: string[];
  details: Record<string, unknown>;
};

export type MedicalInsuranceProfileId = "AOK_BW" | "VDEK_STANDARD" | "PRIVATE" | "UNKNOWN";

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

export type MedicalScanSuccess = {
  ok: true;
  caseId: string;
  documentId: string;
  reviewId: string;
  trafficLight: MedicalTrafficLight;
  warnings: MedicalScanWarning[];
  extracted: MedicalScanExtracted;
  dateLogic: MedicalDateLogicResultDto;
  insuranceRules?: MedicalInsuranceRuleResult | null;
  storageKey: string;
};

export type MedicalScanError = {
  ok: false;
  error: string;
  httpStatus: number;
};

export type MedicalScanResult = MedicalScanSuccess | MedicalScanError;

const ERROR_MESSAGES_DE: Record<string, string> = {
  ride_id_required: "Fahrt-ID fehlt.",
  image_base64_required: "Kein Foto übermittelt.",
  not_found: "Fahrt nicht gefunden.",
  not_medical_ride: "Keine Krankenfahrt.",
  wrong_company: "Fahrt gehört nicht zu Ihrem Unternehmen.",
  driver_not_assigned: "Fahrt ist keinem Fahrer zugewiesen.",
  not_assigned_driver: "Sie sind dieser Fahrt nicht zugewiesen.",
  series_not_found: "Serienfahrt nicht gefunden.",
  database_not_configured: "Server-Datenbank nicht verfügbar.",
  ocr_disabled: "OCR ist auf dem Server deaktiviert.",
  anthropic_api_key_missing: "OCR-Konfiguration fehlt auf dem Server.",
  ocr_request_failed: "OCR-Anfrage fehlgeschlagen.",
  ocr_response_invalid: "OCR-Antwort ungültig.",
  ocr_json_parse_failed: "OCR-Ergebnis konnte nicht gelesen werden.",
  payload_too_large: "Bild ist zu groß.",
  image_size_invalid: "Bild ist zu groß.",
  invalid_base64: "Bildformat ungültig.",
  unsupported_or_corrupt_image: "Bild beschädigt oder nicht unterstützt.",
  unauthorized: "Nicht angemeldet.",
};

export function medicalScanErrorMessageDe(code: string): string {
  return ERROR_MESSAGES_DE[code] ?? `Scan fehlgeschlagen (${code})`;
}

const INSURANCE_PROFILES: MedicalInsuranceProfileId[] = ["AOK_BW", "VDEK_STANDARD", "PRIVATE", "UNKNOWN"];

function parseInsuranceRules(raw: unknown): MedicalInsuranceRuleResult | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const profileRaw = typeof r.profile === "string" ? r.profile : "UNKNOWN";
  const profile = INSURANCE_PROFILES.includes(profileRaw as MedicalInsuranceProfileId)
    ? (profileRaw as MedicalInsuranceProfileId)
    : "UNKNOWN";
  return {
    profile,
    title: typeof r.title === "string" ? r.title : "ONRODA-Vorprüfung",
    summary: typeof r.summary === "string" ? r.summary : "",
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === "string" && w.trim().length > 0)
      : [],
    requiredFields: Array.isArray(r.requiredFields)
      ? r.requiredFields.filter((f): f is string => typeof f === "string" && f.trim().length > 0)
      : [],
    manualReviewRequired: r.manualReviewRequired === true,
    detectedInsuranceName: typeof r.detectedInsuranceName === "string" ? r.detectedInsuranceName : "",
    detectedInsuranceIk: typeof r.detectedInsuranceIk === "string" ? r.detectedInsuranceIk : "",
  };
}

export type PostMedicalTransportScanInput = {
  authToken: string;
  rideId: string;
  imageBase64: string;
  dateLogicType?: "today" | "series" | "return_trip" | "long_term_treatment";
  seriesId?: string;
  returnRideId?: string;
};

export async function postMedicalTransportScan(
  input: PostMedicalTransportScanInput,
): Promise<MedicalScanResult> {
  const token = input.authToken.trim();
  const rideId = input.rideId.trim();
  const API_BASE = getApiBaseUrl();
  if (!API_BASE) {
    return { ok: false, error: "api_not_configured", httpStatus: 0 };
  }
  if (!token || !rideId) {
    return { ok: false, error: "bad_request", httpStatus: 400 };
  }

  const body: Record<string, string> = {
    rideId,
    imageBase64: input.imageBase64,
  };
  if (input.dateLogicType) body.dateLogicType = input.dateLogicType;
  if (input.seriesId?.trim()) body.seriesId = input.seriesId.trim();
  if (input.returnRideId?.trim()) body.returnRideId = input.returnRideId.trim();

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/fleet-driver/v1/medical/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "network_error", httpStatus: 0 };
  }

  const data = (await res.json().catch(() => ({}))) as Partial<MedicalScanSuccess> & { error?: string };
  if (!res.ok || data.ok !== true) {
    const error = typeof data.error === "string" ? data.error : `http_${res.status}`;
    return { ok: false, error, httpStatus: res.status };
  }

  return {
    ok: true,
    caseId: String(data.caseId ?? ""),
    documentId: String(data.documentId ?? ""),
    reviewId: String(data.reviewId ?? ""),
    trafficLight:
      data.trafficLight === "green" || data.trafficLight === "yellow" || data.trafficLight === "red"
        ? data.trafficLight
        : "yellow",
    warnings: Array.isArray(data.warnings)
      ? data.warnings.filter(
          (w): w is MedicalScanWarning =>
            !!w &&
            typeof w === "object" &&
            typeof (w as MedicalScanWarning).code === "string" &&
            typeof (w as MedicalScanWarning).message === "string",
        )
      : [],
    extracted: (data.extracted ?? {}) as MedicalScanExtracted,
    dateLogic: (data.dateLogic ?? {
      type: "today",
      passed: false,
      severity: "warn",
      expectedDate: null,
      ocrDate: null,
      warningCodes: [],
      details: {},
    }) as MedicalDateLogicResultDto,
    insuranceRules: parseInsuranceRules(data.insuranceRules),
    storageKey: String(data.storageKey ?? ""),
  };
}

/** Serien-/Rückfahrt-Kontext aus Ride-Meta für Scan-Request. */
export function medicalScanContextFromRide(partnerBookingMeta: Record<string, unknown> | null | undefined): {
  seriesId?: string;
  returnRideId?: string;
  dateLogicType?: "today" | "series" | "return_trip" | "long_term_treatment";
} {
  if (!partnerBookingMeta || typeof partnerBookingMeta !== "object") return {};
  const nested = partnerBookingMeta.medical;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const med = nested as Record<string, unknown>;
    const seriesId = typeof med.seriesId === "string" ? med.seriesId.trim() : "";
    const returnRideId = typeof med.linkedRideId === "string" ? med.linkedRideId.trim() : "";
    if (seriesId) return { seriesId, dateLogicType: "series" };
    if (returnRideId) return { returnRideId, dateLogicType: "return_trip" };
  }
  return { dateLogicType: "today" };
}
