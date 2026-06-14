import type Stripe from "stripe";
import { financePricingContextFromCompanyRow } from "./adminCompanyProvision";
import { getStripeClient } from "./stripeClient";
import {
  findCompanyIdByStripeConnectAccountId,
  getCompanyStripeConnectRow,
  setCompanyStripeConnectAccountId,
  updateCompanyStripeConnectStatus,
  type CompanyStripeConnectRow,
} from "../db/stripeConnectData";

export type StripeConnectPaymentParams = {
  application_fee_amount: number;
  transfer_data: { destination: string };
};

export interface PanelStripeConnectPublicStatus {
  stripeConfigured: boolean;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboarded: boolean;
  payoutAllowed: boolean;
  needsOnboarding: boolean;
}

function panelBaseUrl(): string {
  const raw = (process.env.PARTNER_REGISTRATION_PANEL_URL ?? "https://panel.onroda.de").trim();
  return raw.replace(/\/$/, "");
}

export function stripeConnectOnboardingUrls(): { returnUrl: string; refreshUrl: string } {
  const base = panelBaseUrl();
  const returnUrl =
    (process.env.STRIPE_CONNECT_RETURN_URL ?? "").trim() || `${base}/?stripe_connect=return`;
  const refreshUrl =
    (process.env.STRIPE_CONNECT_REFRESH_URL ?? "").trim() || `${base}/?stripe_connect=refresh`;
  return { returnUrl, refreshUrl };
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Plattform-Provision in Cent (Spiegel von financeCalculationService, ohne Ride-Kontext). */
export function applicationFeeCentsFromCompanyRow(amountCents: number, row: CompanyStripeConnectRow): number {
  if (amountCents < 50) return 0;
  const grossEur = amountCents / 100;
  const ctx = financePricingContextFromCompanyRow({
    commission_type: row.commissionType,
    commission_rate: row.commissionRate,
    commission_fixed_eur: row.commissionFixedEur,
    min_commission_eur: row.minCommissionEur,
    payout_allowed: row.payoutAllowed,
  });
  let commissionEur = 0;
  if (ctx.commissionType === "fixed") {
    commissionEur = ctx.commissionValue;
  } else if (ctx.commissionType === "none") {
    commissionEur = 0;
  } else {
    commissionEur = roundMoney(grossEur * ctx.commissionValue);
  }
  if (typeof ctx.minCommissionEur === "number" && ctx.minCommissionEur > 0 && ctx.commissionType !== "none") {
    commissionEur = roundMoney(Math.max(commissionEur, ctx.minCommissionEur));
  }
  commissionEur = roundMoney(Math.min(commissionEur, grossEur));
  const feeCents = Math.round(commissionEur * 100);
  if (feeCents <= 0) return 0;
  return Math.min(feeCents, amountCents - 1);
}

export function isCompanyStripeConnectReady(row: CompanyStripeConnectRow): boolean {
  return (
    row.payoutAllowed &&
    Boolean(row.stripeConnectAccountId?.trim()) &&
    row.stripeConnectChargesEnabled
  );
}

export async function resolveStripeConnectPaymentParams(
  companyId: string | null | undefined,
  amountCents: number,
): Promise<StripeConnectPaymentParams | null> {
  const cid = String(companyId ?? "").trim();
  if (!cid || amountCents < 50) return null;
  const row = await getCompanyStripeConnectRow(cid);
  if (!row || !isCompanyStripeConnectReady(row)) return null;
  const accountId = row.stripeConnectAccountId!.trim();
  return {
    application_fee_amount: applicationFeeCentsFromCompanyRow(amountCents, row),
    transfer_data: { destination: accountId },
  };
}

export function panelStripeConnectStatusFromRow(row: CompanyStripeConnectRow | null): PanelStripeConnectPublicStatus {
  const stripeConfigured = getStripeClient() != null;
  if (!row) {
    return {
      stripeConfigured,
      accountId: null,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      onboarded: false,
      payoutAllowed: false,
      needsOnboarding: stripeConfigured,
    };
  }
  const accountId = row.stripeConnectAccountId?.trim() || null;
  const onboarded =
    row.stripeConnectChargesEnabled &&
    row.stripeConnectPayoutsEnabled &&
    row.stripeConnectDetailsSubmitted;
  return {
    stripeConfigured,
    accountId,
    chargesEnabled: row.stripeConnectChargesEnabled,
    payoutsEnabled: row.stripeConnectPayoutsEnabled,
    detailsSubmitted: row.stripeConnectDetailsSubmitted,
    onboarded,
    payoutAllowed: row.payoutAllowed,
    needsOnboarding: stripeConfigured && row.payoutAllowed && !onboarded,
  };
}

export async function syncStripeConnectAccountFromStripe(account: Stripe.Account): Promise<string | null> {
  const metaCompanyId = String(account.metadata?.onroda_company_id ?? "").trim();
  const companyId =
    metaCompanyId || (await findCompanyIdByStripeConnectAccountId(account.id)) || null;
  if (!companyId) return null;

  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;
  const detailsSubmitted = account.details_submitted === true;
  const fullyOnboarded = chargesEnabled && payoutsEnabled && detailsSubmitted;

  await updateCompanyStripeConnectStatus(companyId, {
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    onboardedAt: fullyOnboarded ? new Date() : null,
  });
  return companyId;
}

async function ensureConnectExpressAccount(
  stripe: Stripe,
  row: CompanyStripeConnectRow,
): Promise<string> {
  const existing = row.stripeConnectAccountId?.trim();
  if (existing) return existing;

  const country = (row.country || "DE").trim().slice(0, 2).toUpperCase() || "DE";
  const account = await stripe.accounts.create({
    type: "express",
    country,
    email: row.email.trim() || undefined,
    business_profile: row.companyName.trim()
      ? { name: row.companyName.trim().slice(0, 200) }
      : undefined,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      onroda_company_id: row.companyId,
    },
  });
  await setCompanyStripeConnectAccountId(row.companyId, account.id);
  return account.id;
}

export async function createStripeConnectOnboardingLink(companyId: string): Promise<
  | { ok: true; url: string; accountId: string }
  | { ok: false; error: string; status: number }
> {
  const stripe = getStripeClient();
  if (!stripe) {
    return { ok: false, error: "stripe_not_configured", status: 503 };
  }
  const row = await getCompanyStripeConnectRow(companyId);
  if (!row) {
    return { ok: false, error: "company_not_found", status: 404 };
  }
  if (!row.payoutAllowed) {
    return { ok: false, error: "payout_not_allowed", status: 403 };
  }

  const accountId = await ensureConnectExpressAccount(stripe, row);
  const { returnUrl, refreshUrl } = stripeConnectOnboardingUrls();
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  const url = link.url?.trim();
  if (!url) {
    return { ok: false, error: "stripe_onboarding_url_missing", status: 500 };
  }
  return { ok: true, url, accountId };
}

export async function getPanelStripeConnectStatus(companyId: string): Promise<PanelStripeConnectPublicStatus> {
  const row = await getCompanyStripeConnectRow(companyId);
  return panelStripeConnectStatusFromRow(row);
}
