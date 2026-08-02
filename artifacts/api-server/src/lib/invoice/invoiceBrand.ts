/**
 * ONRODA Billing — zentrale Marke & Rechnungssteller (PDF + spätere UI-Referenz).
 * Änderungen hier wirken auf alle Mandanten-Typen (Hotel, Corporate, Medical, Taxi-Provision, …).
 */

export const ONRODA_INVOICE_BRAND = {
  productName: "ONRODA",
  website: "onroda.de",
  accent: "#EF1D26",
  text: "#1C1C1E",
  muted: "#6B7280",
  surface: "#F2F2F7",
  card: "#FFFFFF",
  border: "#E5E7EB",
} as const;

/** Rechnungssteller (Plattform / Leistungsabrechnung). */
export const ONRODA_INVOICE_SELLER = {
  legalName: "Vedat Öztürk",
  tradingName: "Öztürk Taxiunternehmen",
  street: "Oberdorfstr 53",
  postalCode: "70771",
  city: "Leinfelden-Echterdingen",
  country: "Deutschland",
  iban: "DE88 6115 0020 0104 7668 93",
  taxId: "97076/11679",
  /** Optional — leer = auf PDF auslassen. */
  phone: "",
  email: "info@onroda.de",
} as const;

/**
 * Steuerliche Ausweisung auf dem PDF.
 * Bei Kleinunternehmer (§ 19 UStG): nur Gesamtbetrag + Pflicht-Hinweis, kein Netto/USt-Block.
 * Wenn doch USt. > 0 in den Daten steht: zusätzlich Kurzzeile „Enthaltene USt.“ (Absicherung).
 */
export const ONRODA_INVOICE_TAX = {
  regime: "kleinunternehmer" as const,
  kleinunternehmerNote: "Gemäß § 19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.",
  paymentMethodLabel: "Überweisung",
  introText: "Für die folgende Leistung stellen wir Ihnen den nachstehenden Betrag in Rechnung.",
} as const;

export function sellerAddressLines(): string[] {
  const s = ONRODA_INVOICE_SELLER;
  return [`${s.street}`, `${s.postalCode} ${s.city}`, s.country];
}
