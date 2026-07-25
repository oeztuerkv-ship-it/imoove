/**
 * Temporäre Allowlist: Panel-E-Mails, die trotzdem als Fleet-Fahrer
 * genutzt werden dürfen (z. B. Apple App Review mit einer Review-Note-E-Mail).
 *
 * Env (API): `ONRODA_FLEET_ALLOW_PANEL_EMAILS=a@x.de,b@y.de`
 * Nach Review-Ende: Variable leeren/entfernen und API neu starten.
 */
export function parseFleetAllowPanelEmails(
  raw: string | undefined = process.env.ONRODA_FLEET_ALLOW_PANEL_EMAILS,
): Set<string> {
  const set = new Set<string>();
  for (const part of String(raw ?? "").split(/[,;\s]+/)) {
    const e = part.trim().toLowerCase();
    if (e.includes("@")) set.add(e);
  }
  return set;
}

export function isPanelEmailAllowedForFleetDriver(email: string): boolean {
  const em = email.trim().toLowerCase();
  if (!em) return false;
  return parseFleetAllowPanelEmails().has(em);
}
