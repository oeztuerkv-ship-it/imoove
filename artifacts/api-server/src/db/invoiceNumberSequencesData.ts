import { and, eq, ne, sql } from "drizzle-orm";
import type { getDb } from "./client";
import {
  allocateUniqueCompanyCode,
  billingPeriodYearMonth,
  formatInvoiceNumber,
  resolveCompanyInvoicePrefix,
  suggestCompanyCodeBase,
  type InvoiceNumberParts,
} from "../lib/invoiceNumbering.js";
import { adminCompaniesTable } from "./schema";

type ExecDb = NonNullable<ReturnType<typeof getDb>>;

export type AllocateInvoiceNumberInput = {
  companyId: string;
  billingPeriodEnd: string;
};

/**
 * Setzt company_code, wenn leer (Onboarding-Lücke). Muss mit FOR UPDATE auf der Firma laufen.
 */
export async function ensureCompanyCodeInTx(tx: ExecDb, companyId: string): Promise<string> {
  const id = companyId.trim();
  if (!id) throw Object.assign(new Error("company_required"), { code: "company_required" });

  const rows = await tx
    .select({
      name: adminCompaniesTable.name,
      company_code: adminCompaniesTable.company_code,
    })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.id, id))
    .for("update")
    .limit(1);
  const company = rows[0];
  if (!company) throw Object.assign(new Error("company_not_found"), { code: "company_not_found" });

  const existing = String(company.company_code ?? "").trim();
  if (existing) return existing;

  const takenRows = await tx
    .select({ company_code: adminCompaniesTable.company_code })
    .from(adminCompaniesTable)
    .where(and(ne(adminCompaniesTable.id, id), sql`trim(${adminCompaniesTable.company_code}) <> ''`));
  const taken = new Set(
    takenRows.map((r) => String(r.company_code ?? "").trim().toUpperCase()).filter(Boolean),
  );

  const code = allocateUniqueCompanyCode(suggestCompanyCodeBase(id, company.name), (candidate) =>
    taken.has(candidate.toUpperCase()),
  );

  await tx.update(adminCompaniesTable).set({ company_code: code }).where(eq(adminCompaniesTable.id, id));

  return code;
}

/**
 * Vergibt die nächste Rechnungsnummer atomar (Zeile pro prefix + Monat).
 * Muss innerhalb einer DB-Transaction aufgerufen werden.
 * Leerer company_code wird hier analog zu invoice_prefix nachgezogen (nicht Teil der Nummer).
 */
export async function allocatePartnerInvoiceNumberInTx(
  tx: ExecDb,
  input: AllocateInvoiceNumberInput,
): Promise<InvoiceNumberParts & { companyCode: string }> {
  const companyId = input.companyId.trim();
  if (!companyId) throw Object.assign(new Error("company_required"), { code: "company_required" });

  const companyCode = await ensureCompanyCodeInTx(tx, companyId);

  const rows = await tx
    .select({
      company_kind: adminCompaniesTable.company_kind,
      invoice_prefix: adminCompaniesTable.invoice_prefix,
    })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.id, companyId))
    .limit(1);
  const company = rows[0];
  if (!company) throw Object.assign(new Error("company_not_found"), { code: "company_not_found" });

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
