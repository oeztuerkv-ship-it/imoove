/** Produktions-API, wenn EAS/TestFlight ohne EXPO_PUBLIC_API_URL gebaut wurde (lokale .env gilt dort nicht). */
const PRODUCTION_API_HOST = "https://api.onroda.de";

/**
 * REST-Basis inkl. /api-Suffix. So funktioniert die App, wenn EXPO_PUBLIC_API_URL
 * nur den Host enthält (z. B. https://example.com) oder bereits …/api.
 */
export function getApiBaseUrl(): string {
  const envRaw = (process.env.EXPO_PUBLIC_API_URL ?? "").trim();
  const raw = (envRaw || PRODUCTION_API_HOST).replace(/\/+$/, "");
  if (!raw) return "";
  let normalized = raw;
  // Production safety net: marketing host does not expose full app API methods.
  try {
    const u = new URL(normalized);
    const host = u.hostname.toLowerCase();
    if (host === "onroda.de" || host === "www.onroda.de") {
      u.hostname = "api.onroda.de";
      normalized = `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}`;
    }
  } catch {
    // Keep raw value on malformed env URL and let fetch diagnostics surface it.
  }
  return normalized.endsWith("/api") ? normalized : `${normalized}/api`;
}

/** Body von fehlgeschlagenen API-Responses lesen (z. B. error + hint vom Auth-Start). */
export async function fetchErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const t = await res.text();
    return messageFromErrorBody(t, res.status, fallback);
  } catch {
    /* ignore */
  }
  return fallback;
}

export function messageFromErrorBody(
  body: string,
  status?: number,
  fallback = "Anfrage fehlgeschlagen.",
): string {
  const t = body.trim();
  if (!t) {
    return status != null ? `${fallback} (HTTP ${status})` : fallback;
  }
  try {
    const j = JSON.parse(t) as { error?: string; hint?: string; message?: string };
    if (j.error === "Google Client ID not configured") {
      return "Google ist auf dem Server nicht konfiguriert (GOOGLE_CLIENT_ID / Secret).";
    }
    if (j.error === "AUTH_JWT_SECRET not configured") {
      return "Server: Session-JWT nicht konfiguriert (AUTH_JWT_SECRET).";
    }
    if (j.error && j.hint) return `${j.error}\n\n${j.hint}`;
    if (j.error) return j.error;
    if (j.message) return j.message;
  } catch {
    /* not JSON */
  }
  if (t.startsWith("<")) {
    return status === 404
      ? "API-Route nicht gefunden — prüfe EXPO_PUBLIC_API_URL (https://api.onroda.de/api)."
      : "Server lieferte HTML statt JSON — prüfe die API-URL und ob die API läuft.";
  }
  return t.slice(0, 400);
}

/** Response-Text sicher als JSON-Objekt lesen (kein roher JSON.parse-Fehler in der UI). */
export async function parseApiJsonResponse<T extends Record<string, unknown>>(
  res: Response,
  opts: { fallbackLabel?: string; requiredKeys?: (keyof T)[] } = {},
): Promise<T> {
  const label = opts.fallbackLabel ?? "Server";
  const text = await res.text();
  if (!res.ok) {
    throw new Error(messageFromErrorBody(text, res.status, `${label}-Anfrage fehlgeschlagen.`));
  }
  if (!text.trim()) {
    throw new Error(`${label} antwortete leer — API-URL prüfen (https://api.onroda.de/api).`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    const preview = text.trim().slice(0, 80).replace(/\s+/g, " ");
    throw new Error(
      preview.startsWith("<")
        ? `${label} lieferte HTML statt JSON — EXPO_PUBLIC_API_URL prüfen.`
        : `${label} lieferte keine gültige JSON-Antwort${preview ? `: ${preview}` : ""}.`,
    );
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${label} lieferte ein ungültiges JSON-Format.`);
  }
  const obj = data as T;
  for (const key of opts.requiredKeys ?? []) {
    if (obj[key] == null || obj[key] === "") {
      throw new Error(`${label} antwortete ohne „${String(key)}“.`);
    }
  }
  return obj;
}
