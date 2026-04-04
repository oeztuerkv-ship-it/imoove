/**
 * REST-Basis inkl. /api-Suffix. So funktioniert die App, wenn EXPO_PUBLIC_API_URL
 * nur den Host enthält (z. B. https://example.com) oder bereits …/api.
 */
export function getApiBaseUrl(): string {
  const raw = (process.env.EXPO_PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  return raw.endsWith("/api") ? raw : `${raw}/api`;
}
