import { eq } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { adminCompaniesTable } from "./schema";

export interface CompanyStripeConnectRow {
  companyId: string;
  companyName: string;
  email: string;
  country: string;
  payoutAllowed: boolean;
  commissionType: string;
  commissionRate: number;
  commissionFixedEur: number;
  minCommissionEur: number | null;
  stripeConnectAccountId: string | null;
  stripeConnectChargesEnabled: boolean;
  stripeConnectPayoutsEnabled: boolean;
  stripeConnectDetailsSubmitted: boolean;
  stripeConnectOnboardedAt: Date | null;
}

function rowToConnectRow(r: typeof adminCompaniesTable.$inferSelect): CompanyStripeConnectRow {
  return {
    companyId: r.id,
    companyName: r.name,
    email: r.email,
    country: r.country,
    payoutAllowed: r.payout_allowed,
    commissionType: r.commission_type,
    commissionRate: r.commission_rate,
    commissionFixedEur: r.commission_fixed_eur,
    minCommissionEur: r.min_commission_eur,
    stripeConnectAccountId: r.stripe_connect_account_id ?? null,
    stripeConnectChargesEnabled: r.stripe_connect_charges_enabled,
    stripeConnectPayoutsEnabled: r.stripe_connect_payouts_enabled,
    stripeConnectDetailsSubmitted: r.stripe_connect_details_submitted,
    stripeConnectOnboardedAt: r.stripe_connect_onboarded_at ?? null,
  };
}

export async function getCompanyStripeConnectRow(companyId: string): Promise<CompanyStripeConnectRow | null> {
  if (!isPostgresConfigured()) return null;
  const cid = companyId.trim();
  if (!cid) return null;
  const db = getDb();
  const rows = await db
    .select()
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.id, cid))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return rowToConnectRow(r);
}

export async function setCompanyStripeConnectAccountId(companyId: string, accountId: string): Promise<void> {
  if (!isPostgresConfigured()) return;
  const db = getDb();
  await db
    .update(adminCompaniesTable)
    .set({ stripe_connect_account_id: accountId.trim() })
    .where(eq(adminCompaniesTable.id, companyId.trim()));
}

export async function updateCompanyStripeConnectStatus(
  companyId: string,
  patch: {
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    onboardedAt: Date | null;
  },
): Promise<void> {
  if (!isPostgresConfigured()) return;
  const db = getDb();
  await db
    .update(adminCompaniesTable)
    .set({
      stripe_connect_charges_enabled: patch.chargesEnabled,
      stripe_connect_payouts_enabled: patch.payoutsEnabled,
      stripe_connect_details_submitted: patch.detailsSubmitted,
      stripe_connect_onboarded_at: patch.onboardedAt,
    })
    .where(eq(adminCompaniesTable.id, companyId.trim()));
}

export async function findCompanyIdByStripeConnectAccountId(accountId: string): Promise<string | null> {
  if (!isPostgresConfigured()) return null;
  const aid = accountId.trim();
  if (!aid) return null;
  const db = getDb();
  const rows = await db
    .select({ id: adminCompaniesTable.id })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.stripe_connect_account_id, aid))
    .limit(1);
  return rows[0]?.id ?? null;
}
