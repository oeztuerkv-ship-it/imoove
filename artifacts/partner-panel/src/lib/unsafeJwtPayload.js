/**
 * Nur UI-Heuristik (kein kryptographischer Check). Echte Prüfung: `/panel/v1/me` bzw. `/admin/auth/me`.
 */
export function readJwtPayloadUnsafe(jwt) {
  const t = typeof jwt === "string" ? jwt.trim() : "";
  if (!t) return null;
  const parts = t.split(".");
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const json = atob(b64 + pad);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isLikelyPanelSessionJwt(jwt) {
  const p = readJwtPayloadUnsafe(jwt);
  return p?.kind === "panel";
}
