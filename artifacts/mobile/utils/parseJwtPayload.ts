/**
 * JWT-Payload ohne Signaturprüfung (nur für Anzeige / Client-State).
 * Vertrauliche oder sicherheitskritische Checks nur serverseitig.
 */
export function parseJwtPayloadUnsafe(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const slice = b64 + pad;
    let json: string;
    if (typeof globalThis !== "undefined" && typeof globalThis.atob === "function") {
      json = globalThis.atob(slice);
    } else if (typeof Buffer !== "undefined") {
      json = Buffer.from(slice, "base64").toString("utf8");
    } else {
      return null;
    }
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
