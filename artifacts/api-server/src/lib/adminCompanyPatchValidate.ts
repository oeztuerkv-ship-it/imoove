import type { AdminCompanyUpdateBody } from "../db/adminData";
import { normalizeCompanyCommissionType } from "./adminCompanyProvision";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AdminCompanyFieldErrors = Record<string, string>;

function normIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** Mod-97 IBAN-Prüfung (DE und EU); leer = ok. */
export function isValidIbanOptional(raw: string): boolean {
  const iban = normIban(raw);
  if (!iban) return true;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = "";
  for (const ch of rearranged) {
    const chunk = remainder + (ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch);
    remainder = String(parseInt(chunk, 10) % 97);
  }
  return parseInt(remainder, 10) === 1;
}

export function isValidEmailOptional(raw: string): boolean {
  const e = raw.trim();
  if (!e) return true;
  return EMAIL_RE.test(e);
}

export function validateAdminCompanyPatchBody(
  body: AdminCompanyUpdateBody & {
    block_platform_reason?: string;
    billing_settlement_interval?: string;
    billing_payment_terms_days?: number;
  },
): AdminCompanyFieldErrors {
  const err: AdminCompanyFieldErrors = {};
  if (typeof body.name === "string" && !body.name.trim()) err.name = "Firmenname ist Pflicht.";
  if (typeof body.email === "string" && !isValidEmailOptional(body.email)) err.email = "Ungültige E-Mail.";
  if (typeof body.support_email === "string" && !isValidEmailOptional(body.support_email)) {
    err.support_email = "Ungültige E-Mail.";
  }
  if (typeof body.billing_account_email === "string" && !isValidEmailOptional(body.billing_account_email)) {
    err.billing_account_email = "Ungültige Abrechnungs-E-Mail.";
  }
  if (typeof body.bank_iban === "string" && !isValidIbanOptional(body.bank_iban)) {
    err.bank_iban = "Ungültige IBAN.";
  }
  if (typeof body.commission_rate === "number" && Number.isFinite(body.commission_rate)) {
    const pct = body.commission_rate * 100;
    if (pct < 0 || pct > 100) err.commission_rate = "Provision muss zwischen 0 und 100 % liegen.";
  }
  const ct = body.commission_type !== undefined ? normalizeCompanyCommissionType(body.commission_type) : null;
  if (ct === "fixed" && typeof body.commission_fixed_eur === "number") {
    if (body.commission_fixed_eur < 0) err.commission_fixed_eur = "Fixbetrag darf nicht negativ sein.";
  }
  if (typeof body.min_commission_eur === "number" && body.min_commission_eur < 0) {
    err.min_commission_eur = "Mindestprovision darf nicht negativ sein.";
  }
  if (typeof body.billing_payment_terms_days === "number") {
    if (!Number.isFinite(body.billing_payment_terms_days) || body.billing_payment_terms_days < 0) {
      err.billing_payment_terms_days = "Zahlungsziel muss ≥ 0 Tage sein.";
    }
  }
  const intervals = new Set(["weekly", "biweekly", "monthly", "custom"]);
  if (
    typeof body.billing_settlement_interval === "string" &&
    body.billing_settlement_interval.trim() &&
    !intervals.has(body.billing_settlement_interval.trim())
  ) {
    err.billing_settlement_interval = "Ungültiges Abrechnungsintervall.";
  }
  return err;
}
