import { randomBytes } from "node:crypto";

/**
 * Freigabe der Fahrt: direkt durch den Fahrgast (z. B. App-Zahlung) oder über einen **digitalen Zugangscode**.
 *
 * Der Code ersetzt **keinen klassischen Wertgutschein**, sondern steht für eine **digitale Kostenübernahme**
 * durch einen Auftraggeber (Firma, Hotel, Behörde, …): Buchung mit Prüfung im System, Fahrer sieht nur die
 * Freigabe, nach Abschluss wird der **reale Fahrpreis** (`rides.final_fare`) dem Mandanten (`rides.company_id`)
 * zugeordnet — nachvollziehbar über `rides.access_code_id` und Audit/Export.
 *
 * `ACCESS_CODE_TYPES` klassifizieren den Geschäftsfall (Hotel, Firma, …); technisch ein zentrales Modell.
 */

export const AUTHORIZATION_SOURCES = ["passenger_direct", "access_code"] as const;
export type AuthorizationSource = (typeof AUTHORIZATION_SOURCES)[number];

/** Klassifikation des Auftraggebers / Kanals — kein separates Abrechnungsmodell pro Typ. */
export const ACCESS_CODE_TYPES = ["voucher", "hotel", "company", "general"] as const;
export type AccessCodeType = (typeof ACCESS_CODE_TYPES)[number];

export const DEFAULT_AUTHORIZATION_SOURCE: AuthorizationSource = "passenger_direct";

export function isAuthorizationSource(v: string): v is AuthorizationSource {
  return (AUTHORIZATION_SOURCES as readonly string[]).includes(v);
}

export function isAccessCodeType(v: string): v is AccessCodeType {
  return (ACCESS_CODE_TYPES as readonly string[]).includes(v);
}

export function parseAuthorizationSource(v: unknown): AuthorizationSource | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return isAuthorizationSource(s) ? s : null;
}

export function parseAccessCodeType(v: unknown): AccessCodeType | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return isAccessCodeType(s) ? s : null;
}

/** Eingabe normalisieren (digitaler Abgleich, einheitlich). */
export function normalizeAccessCodeInput(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** Lesbarer Code ohne 0/O/1/I; Länge 8–32 (Default 12). Nur für serverseitige Erzeugung. */
const ACCESS_CODE_GENERATION_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateAccessCodePlain(length = 12): string {
  let len = length;
  if (len < 8 || len > 32) len = 12;
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += ACCESS_CODE_GENERATION_CHARSET[bytes[i]! % ACCESS_CODE_GENERATION_CHARSET.length]!;
  }
  return normalizeAccessCodeInput(out);
}
