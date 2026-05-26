/**
 * Verwendungszweck für Überweisungen (SEPA, max. 140 Zeichen).
 * Menschenlesbar: Marke + Unternehmensname + Abrechnungsmonat + Rechnungsnummer —
 * **keine** interne `company_id` (z. B. co-demo-1).
 */

const SEPA_MAX_LEN = 140;

export function sanitizePaymentReferencePart(value: string, maxLen: number): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.slice(0, maxLen);
}

export function billingPeriodYearMonth(isoDate: string): string {
  const t = String(isoDate ?? "").trim();
  const m = t.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  const d = new Date(t.includes("T") ? t : `${t}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${mo}`;
}

/** Entfernt interne Mandanten-IDs aus Anzeigenamen (z. B. „Hotel (co-demo-1)“). */
export function stripInternalCompanyIdFromDisplayName(name: string): string {
  return name
    .replace(/\(\s*co-[a-z0-9][a-z0-9-]*\s*\)/gi, " ")
    .replace(/\bco-[a-z0-9][a-z0-9-]*\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildInvoicePaymentReference(input: {
  companyDisplayName: string;
  billingPeriodEnd: string;
  invoiceNumber: string;
}): string {
  const display = stripInternalCompanyIdFromDisplayName(input.companyDisplayName.trim()) || "Mandant";
  const company = sanitizePaymentReferencePart(display, 48);
  const period = billingPeriodYearMonth(input.billingPeriodEnd);
  const invoiceNumber = sanitizePaymentReferencePart(input.invoiceNumber.trim(), 40);
  const parts = ["ONRODA", company];
  if (period) parts.push(period);
  if (invoiceNumber) parts.push(invoiceNumber);
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, SEPA_MAX_LEN);
}

export function resolveInvoicePaymentReference(args: {
  storedReference?: string | null;
  companyDisplayName: string;
  billingPeriodEnd: string;
  invoiceNumber: string;
}): string {
  const stored = String(args.storedReference ?? "").trim();
  if (stored) return stored;
  return buildInvoicePaymentReference({
    companyDisplayName: args.companyDisplayName,
    billingPeriodEnd: args.billingPeriodEnd,
    invoiceNumber: args.invoiceNumber,
  });
}
