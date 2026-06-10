/**
 * Claude Vision OCR für deutsche Krankenfahrt-Transportscheine.
 * Keine Diagnose — nur abrechnungsrelevante Felder.
 */

export const MEDICAL_OCR_PROVIDER = "anthropic_claude_vision";
export const DEFAULT_MEDICAL_OCR_MODEL = "claude-sonnet-4-6";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export function isMedicalOcrEnabled(): boolean {
  const v = (process.env.MEDICAL_OCR_ENABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function getAnthropicApiKey(): string | null {
  const key = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  return key || null;
}

export function resolveMedicalOcrModel(): string {
  const configured = (process.env.MEDICAL_OCR_MODEL ?? "").trim();
  return configured || DEFAULT_MEDICAL_OCR_MODEL;
}

export type ClaudeVisionOcrResult =
  | { ok: true; rawJson: Record<string, unknown>; model: string; provider: string }
  | { ok: false; error: string };

const EXTRACTION_PROMPT = `Du analysierst ein Foto eines deutschen Krankenfahrt-Transportscheins (AOK Muster 4 / vergleichbar).
Extrahiere NUR abrechnungsrelevante Felder — KEINE Diagnosen, KEINE ICD-Codes, KEINE medizinischen Befunde.

Antworte ausschließlich mit einem JSON-Objekt (kein Markdown, kein Fließtext) in exakt dieser Struktur:
{
  "patientDisplayName": string,
  "patientReference": string,
  "insuranceName": string,
  "insuranceIk": string,
  "transportDate": "YYYY-MM-DD" | null,
  "validFrom": "YYYY-MM-DD" | null,
  "validUntil": "YYYY-MM-DD" | null,
  "aufnahmedatum": "YYYY-MM-DD" | null,
  "entlassungsdatum": "YYYY-MM-DD" | null,
  "documentKind": "transport_sheet" | "signature_image" | "other",
  "behandlungsArt": "stationaer" | "ambulant" | "unbekannt",
  "behandlungsKontext": "standard" | "vorstationaer" | "nachstationaer" | "unbekannt",
  "behandlungsFrequenz": "keine" | "dialyse" | "chemo" | "strahlen" | "unbekannt",
  "pflegegrad": "3" | "4" | "5" | "keins" | "unbekannt",
  "merkzeichen": "aG" | "Bl" | "H" | "G" | "keins" | "unbekannt",
  "dauerhafteMobilitaetsbeeintraechtigung": boolean,
  "fernbehandlungErkannt": boolean,
  "genehmigungsnummer": string | null,
  "pickupStreet": string,
  "pickupHouseNumber": string,
  "pickupPostalCode": string,
  "pickupCity": string,
  "destinationStreet": string,
  "destinationHouseNumber": string,
  "destinationPostalCode": string,
  "destinationCity": string,
  "hasSignatureOnDocument": boolean,
  "confidence": {
    "patientDisplayName": number,
    "patientReference": number,
    "insuranceName": number,
    "insuranceIk": number,
    "transportDate": number,
    "validFrom": number,
    "validUntil": number,
    "aufnahmedatum": number,
    "entlassungsdatum": number,
    "behandlungsArt": number,
    "behandlungsKontext": number,
    "behandlungsFrequenz": number,
    "pflegegrad": number,
    "merkzeichen": number,
    "dauerhafteMobilitaetsbeeintraechtigung": number,
    "fernbehandlungErkannt": number,
    "genehmigungsnummer": number,
    "pickupStreet": number,
    "pickupHouseNumber": number,
    "pickupPostalCode": number,
    "pickupCity": number,
    "destinationStreet": number,
    "destinationHouseNumber": number,
    "destinationPostalCode": number,
    "destinationCity": number
  }
}

Regeln:
- Fehlende Werte als leerer String "" oder null bei Datumsfeldern; boolean false wenn nicht angekreuzt.
- insuranceIk: nur Ziffern (IK der Krankenkasse).
- behandlungsArt: angekreuztes Feld ambulant vs. stationär.
- behandlungsKontext: "vorstationaer" bei Vorstationär/Aufnahme vor stationärer Behandlung; "nachstationaer" bei Entlassung/nachstationär; sonst "standard".
- aufnahmedatum: geplantes Aufnahmedatum bei vorstationär; entlassungsdatum: Entlassungsdatum bei nachstationär.
- behandlungsFrequenz: "dialyse" (Dialyse/Hämodialyse), "chemo" (Chemotherapie), "strahlen" (Strahlentherapie) wenn angekreuzt/genannt; sonst "keine".
- pflegegrad: nur 3, 4, 5 wenn angekreuzt — PG3 ist NICHT automatisch genehmigungsfrei.
- dauerhafteMobilitaetsbeeintraechtigung: true nur wenn Checkbox/Text „dauerhafte Mobilitätsbeeinträchtigung" auf dem Schein erkennbar.
- merkzeichen: aG, Bl, H oder G (Gehbehinderung) wenn angekreuzt; G nicht mit aG verwechseln; sonst "keins" oder "unbekannt".
- genehmigungsnummer: KK-Genehmigungsnummer falls lesbar, sonst null.
- validFrom/validUntil: Gültigkeitszeitraum/Dauerverordnung falls lesbar.
- fernbehandlungErkannt: true wenn „Videosprechstunde“, „telefonisch“, Fernbehandlung o. Ä. auf dem Schein erkennbar (§2 Abs. 5).
- pickupStreet/pickupHouseNumber/pickupPostalCode/pickupCity: Abholadresse (Wohnadresse Patient oder Start der Fahrt) — Straße ohne Hausnummer, PLZ 5-stellig.
- destinationStreet/destinationHouseNumber/destinationPostalCode/destinationCity: Zieladresse (Praxis, Klinik, Dialyse, Reha o. Ä.) — Straße ohne Hausnummer, PLZ 5-stellig.
- Wenn nur eine Adresszeile lesbar ist: Patientenadresse bevorzugt als Abholadresse; Behandlungsort/Ziel als Zieladresse.
- hasSignatureOnDocument: true wenn Patientenunterschrift sichtbar.
- confidence: 0.0–1.0 pro Feld; bei Unsicherheit niedrig wählen.
- Wenn das Bild kein Transportschein ist: documentKind "other", sonstige Felder leer lassen.`;

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function extractTextFromAnthropicBody(body: unknown): string {
  if (!isRecord(body)) return "";
  const content = body.content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("\n").trim();
}

function parseJsonFromModelText(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  try {
    const parsed = JSON.parse(candidate) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
        return isRecord(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function runClaudeVisionMedicalOcr(input: {
  buffer: Buffer;
  mime: "image/jpeg" | "image/png";
  model?: string;
}): Promise<ClaudeVisionOcrResult> {
  if (!isMedicalOcrEnabled()) {
    return { ok: false, error: "ocr_disabled" };
  }

  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return { ok: false, error: "anthropic_api_key_missing" };
  }

  const model = input.model?.trim() || resolveMedicalOcrModel();
  const mediaType = input.mime;
  const data = input.buffer.toString("base64");

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1400,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data },
              },
              { type: "text", text: EXTRACTION_PROMPT },
            ],
          },
        ],
      }),
    });
  } catch {
    return { ok: false, error: "ocr_request_failed" };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: "ocr_response_invalid" };
  }

  if (!response.ok) {
    const errType =
      isRecord(body) && typeof body.error === "object" && isRecord(body.error) && typeof body.error.type === "string"
        ? body.error.type
        : "ocr_http_error";
    return { ok: false, error: errType };
  }

  const text = extractTextFromAnthropicBody(body);
  const parsed = parseJsonFromModelText(text);
  if (!parsed) {
    return {
      ok: false,
      error: "ocr_json_parse_failed",
    };
  }

  const rawJson: Record<string, unknown> = {
    provider: MEDICAL_OCR_PROVIDER,
    model,
    anthropic: body,
    extracted: parsed,
  };

  return { ok: true, rawJson, model, provider: MEDICAL_OCR_PROVIDER };
}
