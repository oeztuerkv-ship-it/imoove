/**
 * REST-Basis inkl. /api-Suffix. So funktioniert die App, wenn EXPO_PUBLIC_API_URL
 * nur den Host enthält (z. B. https://example.com) oder bereits …/api.
 */
export function getApiBaseUrl(): string {
  const raw = (process.env.EXPO_PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  return raw.endsWith("/api") ? raw : `${raw}/api`;
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
