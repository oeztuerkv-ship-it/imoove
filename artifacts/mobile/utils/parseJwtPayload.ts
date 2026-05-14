/**
 * JWT-Payload ohne Signaturprüfung (nur für Anzeige / Client-State).
 * Vertrauliche oder sicherheitskritische Checks nur serverseitig.
 */

/** Base64(Base64url)-Payload → UTF-8-String (JWT-JSON ist UTF-8, nicht Latin-1). */
function base64UrlToUtf8String(b64url: string): string | null {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const slice = b64 + pad;
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(slice, "base64").toString("utf8");
    }
    if (typeof globalThis.atob !== "function") return null;
    const binary = globalThis.atob(slice);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xff;
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    }
    return null;
  } catch {
    return null;
  }
}

export function parseJwtPayloadUnsafe(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  const json = base64UrlToUtf8String(parts[1]);
  if (json == null) return null;
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
