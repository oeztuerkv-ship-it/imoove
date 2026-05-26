import { sql } from "drizzle-orm";
import type { getDb } from "./client";
import {
  billingPeriodYearMonth,
  formatInvoiceNumber,
  resolveCompanyInvoicePrefix,
  type InvoiceNumberParts,
} from "../lib/invoiceNumbering.js";
import { adminCompaniesTable } from "./schema";

type ExecDb = NonNullable<ReturnType<typeof getDb>>;

export type AllocateInvoiceNumberInput = {
  companyId: string;
  billingPeriodEnd: string;
};

/**
 * Vergibt die nächste Rechnungsnummer atomar (Zeile pro prefix + Monat).
 * Muss innerhalb einer DB-Transaction aufgerufen werden.
 */
export async function allocatePartnerInvoiceNumberInTx(
  tx: ExecDb,
  input: AllocateInvoiceNumberInput,
): Promise<InvoiceNumberParts & { companyCode: string }> {
  const companyId = input.companyId.trim();
  if (!companyId) throw Object.assign(new Error("company_required"), { code: "company_required" });

  const rows = await tx
    .select({
      company_kind: adminCompaniesTable.company_kind,
      invoice_prefix: adminCompaniesTable.invoice_prefix,
      company_code: adminCompaniesTable.company_code,
    })
    .from(adminCompaniesTable)
    .where(sql`${adminCompaniesTable.id} = ${companyId}`)
    .for("update")
    .limit(1);
  const company = rows[0];
  if (!company) throw Object.assign(new Error("company_not_found"), { code: "company_not_found" });

  const companyCode = String(company.company_code ?? "").trim();
  if (!companyCode) {
    throw Object.assign(new Error("company_code_required"), { code: "company_code_required" });
  }

  const invoicePrefix = resolveCompanyInvoicePrefix(company.invoice_prefix, company.company_kind);
  const periodYm = billingPeriodYearMonth(input.billingPeriodEnd);
  if (!periodYm) throw Object.assign(new Error("invalid_billing_period"), { code: "invalid_billing_period" });

  const inserted = await tx.execute(sql`
    INSERT INTO invoice_number_sequences (invoice_prefix, period_ym, next_value)
    VALUES (${invoicePrefix}, ${periodYm}, 2)
    ON CONFLICT (invoice_prefix, period_ym)
    DO UPDATE SET next_value = invoice_number_sequences.next_value + 1
    RETURNING next_value - 1 AS assigned_seq
  `);
  const assignedRaw = (inserted.rows[0] as { assigned_seq?: number | string } | undefined)?.assigned_seq;
  const sequence = Number(assignedRaw);
  if (!Number.isFinite(sequence) || sequence < 1) {
    throw new Error("invoice_sequence_allocation_failed");
  }

  const invoiceNumber = formatInvoiceNumber(invoicePrefix, periodYm, sequence);
  return { invoiceNumber, invoicePrefix, periodYm, sequence, companyCode };
}
