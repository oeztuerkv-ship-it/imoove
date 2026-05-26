/**
 * SEPA-Verwendungszweck = Rechnungsnummer (z. B. ONR-HOT-2026-04-001).
 * Mandantenart steckt im Prefix (HOT, MED, …); company_code/company_id nur intern.
 */

import { parseInvoiceNumber } from "./invoiceNumbering.js";

const SEPA_MAX_LEN = 140;

/** Banktaugliche Rechnungsnummer (ONR-PREFIX-YYYY-MM-SEQ). */
export function normalizePaymentReferenceFromInvoiceNumber(invoiceNumber: string): string {
  const trimmed = String(invoiceNumber ?? "").trim().toUpperCase();
  const parsed = parseInvoiceNumber(trimmed);
  if (parsed) return parsed.invoiceNumber.slice(0, SEPA_MAX_LEN);
  return trimmed.replace(/[^A-Z0-9-]/g, "").replace(/-+/g, "-").slice(0, SEPA_MAX_LEN);
}

/** Verwendungszweck für neue Rechnungen und Anzeige — immer die Rechnungsnummer. */
export function buildInvoicePaymentReference(input: { invoiceNumber: string }): string {
  const ref = normalizePaymentReferenceFromInvoiceNumber(input.invoiceNumber);
  if (!ref) throw new Error("invoice_number_required");
  return ref;
}

/**
 * Liefert den banktauglichen Verwendungszweck.
 * Legacy-Werte in `payment_reference` (lange ONRODA-…-Texte) werden durch die Rechnungsnummer ersetzt.
 */
export function resolveInvoicePaymentReference(args: {
  invoiceNumber: string;
  storedReference?: string | null;
}): string {
  const fromNumber = buildInvoicePaymentReference({ invoiceNumber: args.invoiceNumber });
  const stored = String(args.storedReference ?? "").trim();
  if (!stored) return fromNumber;
  if (stored === fromNumber) return stored;
  if (parseInvoiceNumber(stored)) return stored;
  return fromNumber;
}

/** Bankmatching: Verwendungszweck → strukturierte Rechnungsnummer (oder null). */
export function lookupPaymentReferenceForBankMatching(reference: string) {
  const trimmed = String(reference ?? "").trim();
  if (!trimmed) return null;
  return parseInvoiceNumber(trimmed) ?? parseInvoiceNumber(normalizePaymentReferenceFromInvoiceNumber(trimmed));
}
