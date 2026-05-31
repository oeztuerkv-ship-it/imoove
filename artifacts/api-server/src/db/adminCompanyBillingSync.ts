import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "./client";
import { billingAccountsTable } from "./schema";

const SETTLEMENT_INTERVALS = new Set(["weekly", "biweekly", "monthly", "custom"]);

export type BillingAccountSnapshot = {
  billingEmail: string | null;
  settlementInterval: string | null;
  paymentTermsDays: number | null;
  accountName: string | null;
};

export async function getCompanyBillingAccountSnapshot(companyId: string): Promise<BillingAccountSnapshot> {
  const empty: BillingAccountSnapshot = {
    billingEmail: null,
    settlementInterval: null,
    paymentTermsDays: null,
    accountName: null,
  };
  const db = getDb();
  if (!db) return empty;
  const [row] = await db
    .select({
      billing_email: billingAccountsTable.billing_email,
      settlement_interval: billingAccountsTable.settlement_interval,
      payment_terms_days: billingAccountsTable.payment_terms_days,
      account_name: billingAccountsTable.account_name,
    })
    .from(billingAccountsTable)
    .where(and(eq(billingAccountsTable.company_id, companyId), eq(billingAccountsTable.is_active, true)))
    .limit(1);
  if (!row) return empty;
  return {
    billingEmail: row.billing_email?.trim() || null,
    settlementInterval: row.settlement_interval ?? null,
    paymentTermsDays: row.payment_terms_days ?? null,
    accountName: row.account_name?.trim() || null,
  };
}

export async function syncCompanyBillingAccountFields(
  companyId: string,
  patch: {
    billing_account_email?: string;
    billing_settlement_interval?: string;
    billing_payment_terms_days?: number;
    billing_account_name?: string;
  },
): Promise<BillingAccountSnapshot> {
  const db = getDb();
  if (!db) return getCompanyBillingAccountSnapshot(companyId);

  const now = new Date();
  const [row] = await db
    .select({ id: billingAccountsTable.id })
    .from(billingAccountsTable)
    .where(and(eq(billingAccountsTable.company_id, companyId), eq(billingAccountsTable.is_active, true)))
    .limit(1);

  const set: Partial<typeof billingAccountsTable.$inferInsert> = { updated_at: now };
  if (typeof patch.billing_account_email === "string") {
    set.billing_email = patch.billing_account_email.trim();
  }
  if (typeof patch.billing_settlement_interval === "string") {
    const iv = patch.billing_settlement_interval.trim();
    if (SETTLEMENT_INTERVALS.has(iv)) set.settlement_interval = iv;
  }
  if (typeof patch.billing_payment_terms_days === "number" && Number.isFinite(patch.billing_payment_terms_days)) {
    set.payment_terms_days = Math.max(0, Math.floor(patch.billing_payment_terms_days));
  }
  if (typeof patch.billing_account_name === "string") {
    set.account_name = patch.billing_account_name.trim().slice(0, 200);
  }

  if (row) {
    if (Object.keys(set).length > 1) {
      await db.update(billingAccountsTable).set(set).where(eq(billingAccountsTable.id, row.id));
    }
  } else if (typeof patch.billing_account_email === "string" && patch.billing_account_email.trim()) {
    await db.insert(billingAccountsTable).values({
      id: `ba-${randomUUID()}`,
      company_id: companyId,
      account_name: patch.billing_account_name?.trim() || "Partner-Abrechnung",
      billing_email: patch.billing_account_email.trim(),
      settlement_interval:
        patch.billing_settlement_interval && SETTLEMENT_INTERVALS.has(patch.billing_settlement_interval.trim())
          ? patch.billing_settlement_interval.trim()
          : "monthly",
      payment_terms_days:
        typeof patch.billing_payment_terms_days === "number"
          ? Math.max(0, Math.floor(patch.billing_payment_terms_days))
          : 14,
    });
  }

  return getCompanyBillingAccountSnapshot(companyId);
}
