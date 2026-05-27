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
    const j = JSON.parse(t) as { error?: string; hint?: string };
    if (j.error && j.hint) return `${j.error}\n\n${j.hint}`;
    if (j.error) return j.error;
    if (t.trim()) return t.trim().slice(0, 400);
  } catch {
    /* ignore */
  }
  return fallback;
}
