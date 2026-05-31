-- Admin: Provisionsmodell pro Mandant (ride_financials / Finance)

ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS commission_type TEXT NOT NULL DEFAULT 'percentage';

ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS commission_fixed_eur DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS min_commission_eur DOUBLE PRECISION;

ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS payout_allowed BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS panel_access_enabled BOOLEAN NOT NULL DEFAULT TRUE;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_companies_commission_type_chk'
  ) THEN
    ALTER TABLE admin_companies
      ADD CONSTRAINT admin_companies_commission_type_chk
      CHECK (commission_type IN ('percentage', 'fixed', 'hybrid', 'none'));
  END IF;
END $$;
