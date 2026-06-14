-- Stripe Connect Express: Auszahlung an Partner-Mandant (Plattform behält Provision via application_fee).
ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_connect_onboarded_at TIMESTAMPTZ NULL;

CREATE UNIQUE INDEX IF NOT EXISTS admin_companies_stripe_connect_account_uidx
  ON admin_companies (stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;

COMMENT ON COLUMN admin_companies.stripe_connect_account_id IS 'Stripe Connect Express account id (acct_…)';
COMMENT ON COLUMN admin_companies.stripe_connect_onboarded_at IS 'Zeitpunkt vollständiger Connect-Freigabe (charges+payouts+details)';
