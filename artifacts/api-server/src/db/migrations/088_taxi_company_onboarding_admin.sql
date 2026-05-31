-- Taxi-Unternehmen Onboarding: Ampel-Status + ergänzende Stammdaten (088).
-- Bestehende Spalten phone, bank_iban (= IBAN), tax_id (= Steuernummer), concession_number bleiben maßgeblich.

ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS trade_license_number TEXT NOT NULL DEFAULT '';

ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'incomplete';

ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS onboarding_approved_at TIMESTAMPTZ;

ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS onboarding_approved_by TEXT;

ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS kk_module_notes TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_companies_onboarding_status_chk'
  ) THEN
    ALTER TABLE admin_companies
      ADD CONSTRAINT admin_companies_onboarding_status_chk
      CHECK (onboarding_status IN ('incomplete', 'pending', 'approved'));
  END IF;
END $$;
