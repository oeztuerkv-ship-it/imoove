/**
 * ONRODA Rechnungsnummern: ONR-{PREFIX}-{YYYY}-{MM}-{SEQ}
 * z. B. ONR-HOT-2026-04-001
 *
 * PREFIX kommt von admin_companies.invoice_prefix (Default aus company_kind).
 * SEQ pro (invoice_prefix, Abrechnungsmonat) — global je Prefix/Monat, nicht pro company_id.
 */

export const INVOICE_NUMBER_BRAND = "ONR";

export type InvoiceNumberParts = {
  invoiceNumber: string;
  invoicePrefix: string;
  periodYm: string;
  sequence: number;
};

const KIND_DEFAULT_PREFIX: Record<string, string> = {
  hotel: "HOT",
  corporate: "COR",
  medical: "MED",
  insurer: "MED",
  taxi: "TAX",
  voucher_client: "VCH",
  general: "GEN",
};

export function defaultInvoicePrefixForCompanyKind(companyKind: string): string {
  const k = String(companyKind ?? "")
    .trim()
    .toLowerCase();
  return KIND_DEFAULT_PREFIX[k] ?? "GEN";
}

/** 2–8 Zeichen, Großbuchstaben/Ziffern (SEPA-/Export-tauglich). */
export function normalizeInvoicePrefix(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

/** Öffentlicher Mandanten-Code (eindeutig), 2–16 Zeichen. */
export function normalizeCompanyCode(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 16);
}

export function billingPeriodYearMonth(isoDate: string): string {
  const t = String(isoDate ?? "").trim();
  const m = t.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  const d = new Date(t.includes("T") ? t : `${t}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatInvoiceNumber(prefix: string, periodYm: string, sequence: number): string {
  const p = normalizeInvoicePrefix(prefix);
  const [y, mo] = periodYm.split("-");
  if (!p || !y || !mo) {
    throw new Error("invalid_invoice_number_parts");
  }
  const seq = Math.max(1, Math.floor(sequence));
  if (seq > 999) {
    throw new Error("invoice_sequence_overflow");
  }
  return `${INVOICE_NUMBER_BRAND}-${p}-${y}-${mo}-${String(seq).padStart(3, "0")}`;
}

export function parseInvoiceNumber(invoiceNumber: string): InvoiceNumberParts | null {
  const m = String(invoiceNumber ?? "")
    .trim()
    .match(/^ONR-([A-Z0-9]{2,8})-(\d{4})-(\d{2})-(\d{3})$/);
  if (!m) return null;
  return {
    invoiceNumber: invoiceNumber.trim(),
    invoicePrefix: m[1]!,
    periodYm: `${m[2]}-${m[3]}`,
    sequence: Number(m[4]),
  };
}

export function resolveCompanyInvoicePrefix(storedPrefix: string | null | undefined, companyKind: string): string {
  const normalized = normalizeInvoicePrefix(storedPrefix ?? "");
  if (normalized) return normalized;
  return defaultInvoicePrefixForCompanyKind(companyKind);
}

const COMPANY_CODE_RE = /^[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?$/;

export function validateCompanyCode(raw: string): { ok: true; code: string } | { ok: false; error: string } {
  const code = normalizeCompanyCode(raw);
  if (code.length < 2) return { ok: false, error: "company_code_too_short" };
  if (code.length > 16) return { ok: false, error: "company_code_too_long" };
  if (!COMPANY_CODE_RE.test(code)) return { ok: false, error: "company_code_invalid" };
  return { ok: true, code };
}

export function validateInvoicePrefix(raw: string): { ok: true; prefix: string } | { ok: false; error: string } {
  const prefix = normalizeInvoicePrefix(raw);
  if (prefix.length < 2) return { ok: false, error: "invoice_prefix_too_short" };
  if (prefix.length > 8) return { ok: false, error: "invoice_prefix_too_long" };
  return { ok: true, prefix };
}

/** Bankmatching / Support: strukturierte Teile aus Rechnungsnummer (oder null bei Legacy-Format). */
export function lookupInvoiceNumberParts(invoiceNumber: string): InvoiceNumberParts | null {
  return parseInvoiceNumber(invoiceNumber);
}
