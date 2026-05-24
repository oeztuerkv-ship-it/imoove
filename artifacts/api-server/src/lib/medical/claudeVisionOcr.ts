/**
 * Claude Vision OCR für deutsche Krankenfahrt-Transportscheine.
 * Keine Diagnose — nur abrechnungsrelevante Felder.
 */

export const MEDICAL_OCR_PROVIDER = "anthropic_claude_vision";
export const DEFAULT_MEDICAL_OCR_MODEL = "claude-sonnet-4-20250514";

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

const EXTRACTION_PROMPT = `Du analysierst ein Foto eines deutschen Krankenfahrt-Transportscheins (Verordnung/Schein).
Extrahiere NUR abrechnungsrelevante Felder — KEINE Diagnosen, KEINE ICD-Codes, KEINE medizinischen Befunde.

Antworte ausschließlich mit einem JSON-Objekt (kein Markdown, kein Fließtext) in exakt dieser Struktur:
{
  "patientDisplayName": string,
  "patientReference": string,
  "insuranceName": string,
  "insuranceIk": string,
  "partnerIkNumber": string,
  "transportDate": "YYYY-MM-DD" | null,
  "validFrom": "YYYY-MM-DD" | null,
  "validUntil": "YYYY-MM-DD" | null,
  "documentKind": "transport_sheet" | "signature_image" | "other",
  "behandlungsArt": "stationaer" | "ambulant" | "unbekannt",
  "pflegegrad": "3" | "4" | "5" | "keins" | "unbekannt",
  "merkzeichen": "aG" | "Bl" | "H" | "keins" | "unbekannt",
  "genehmigungsnummer": string | null,
  "hasSignatureOnDocument": boolean,
  "confidence": {
    "patientDisplayName": number,
    "patientReference": number,
    "insuranceName": number,
    "insuranceIk": number,
    "partnerIkNumber": number,
    "transportDate": number,
    "validFrom": number,
    "validUntil": number,
    "behandlungsArt": number,
    "pflegegrad": number,
    "merkzeichen": number,
    "genehmigungsnummer": number
  }
}

Regeln:
- Fehlende Werte als leerer String "" oder null bei Datumsfeldern.
- insuranceIk / partnerIkNumber: nur Ziffern (Institutionskennzeichen IK).
- behandlungsArt: erkenne angekreuztes Feld ambulant vs. stationär auf dem Schein.
- pflegegrad: nur 3, 4, 5 wenn angekreuzt/lesbar, sonst "keins" oder "unbekannt".
- merkzeichen: aG, Bl oder H wenn angekreuzt, sonst "keins" oder "unbekannt".
- genehmigungsnummer: KK-Genehmigungsnummer falls lesbar, sonst null.
- hasSignatureOnDocument: true wenn Patientenunterschrift auf dem Schein sichtbar.
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
        max_tokens: 1200,
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

  // TEMP DEBUG: rohe Claude-Antwort (nach Deploy entfernen)
  console.log(
    "[medical-ocr-debug] claude raw response",
    JSON.stringify({ httpStatus: response.status, ok: response.ok, body }, null, 2),
  );

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
