/**
 * Fahrttyp (Produktlinie) und Zahlerlogik — Grundlage für spätere Abrechnung.
 * Werte sind stabil zu halten (DB-Text); UI-Labels separat.
 */

export const RIDE_KINDS = ["standard", "medical", "voucher", "company"] as const;
export type RideKind = (typeof RIDE_KINDS)[number];

/**
 * Wer rechnet / wer zahlt (Abrechnungsgegenpart).
 * Bei `authorizationSource === 'access_code'` und gesetztem `companyId` soll die Fahrt typischerweise
 * als **Kostenübernahme durch den Mandanten** laufen (`payerKind: company`); `finalFare` nach Abschluss
 * ist dann die Abrechnungsgrundlage gegenüber diesem Auftraggeber.
 */
/** API/Clients dürfen synonym `external` senden → wird als `third_party` gespeichert. */
export const PAYER_KINDS = ["passenger", "company", "insurance", "voucher", "third_party"] as const;
export type PayerKind = (typeof PAYER_KINDS)[number];

export const DEFAULT_RIDE_KIND: RideKind = "standard";
export const DEFAULT_PAYER_KIND: PayerKind = "passenger";

/**
 * Nach gültiger Einlösung eines Zugangscodes: Kostenträger fürs System.
 * Mit `companyId` (vom Code oder Buchungskontext) → Abrechnung gegen `admin_companies`;
 * ohne Mandant → externer Drittkostenträger (`third_party`), trotzdem nachvollziehbar über `access_code_id`.
 */
export function payerKindForAccessCodeRide(companyId: string | null | undefined): PayerKind {
  return companyId ? "company" : "third_party";
}

export function isRideKind(v: string): v is RideKind {
  return (RIDE_KINDS as readonly string[]).includes(v);
}

export function isPayerKind(v: string): v is PayerKind {
  return (PAYER_KINDS as readonly string[]).includes(v);
}

export function parseRideKind(v: unknown): RideKind | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return isRideKind(s) ? s : null;
}

export function parsePayerKind(v: unknown): PayerKind | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s.toLowerCase() === "external") return "third_party";
  return isPayerKind(s) ? s : null;
}

/** Optionale Freitextfelder (Gutscheincode, Aktenzeichen, Leistungsreferenz). */
export function parseOptionalBillingTag(v: unknown, maxLen: number): string | null {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, maxLen);
}
