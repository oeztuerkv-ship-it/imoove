-- Governance-Hardening: Mandantenstatus, Limits, Rechte-Matrix, Änderungsanträge.
-- Ziel: kritische Stammdaten nur adminseitig; Partner nur via Change-Request.

ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS legal_form TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS owner_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_address_line1 TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_address_line2 TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_postal_code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_city TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_country TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_iban TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_bic TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS support_email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS dispo_phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS opening_hours TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS business_notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS compliance_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS contract_status TEXT NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS max_drivers INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS max_vehicles INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS fare_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS insurer_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS area_assignments JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE admin_companies DROP CONSTRAINT IF EXISTS admin_companies_company_kind_chk;
ALTER TABLE admin_companies
  ADD CONSTRAINT admin_companies_company_kind_chk
  CHECK (company_kind IN ('general', 'taxi', 'voucher_client', 'insurer', 'hotel', 'corporate'));

ALTER TABLE admin_companies DROP CONSTRAINT IF EXISTS admin_companies_verification_status_chk;
ALTER TABLE admin_companies
  ADD CONSTRAINT admin_companies_verification_status_chk
  CHECK (verification_status IN ('pending', 'in_review', 'verified', 'rejected'));

ALTER TABLE admin_companies DROP CONSTRAINT IF EXISTS admin_companies_compliance_status_chk;
ALTER TABLE admin_companies
  ADD CONSTRAINT admin_companies_compliance_status_chk
  CHECK (compliance_status IN ('pending', 'in_review', 'compliant', 'non_compliant'));

ALTER TABLE admin_companies DROP CONSTRAINT IF EXISTS admin_companies_contract_status_chk;
ALTER TABLE admin_companies
  ADD CONSTRAINT admin_companies_contract_status_chk
  CHECK (contract_status IN ('inactive', 'active', 'suspended', 'terminated'));

CREATE TABLE IF NOT EXISTS company_change_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  requested_by_panel_user_id TEXT NOT NULL REFERENCES panel_users (id) ON DELETE RESTRICT,
  request_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  admin_decision_note TEXT NOT NULL DEFAULT '',
  decided_by_admin_user_id TEXT REFERENCES admin_auth_users (id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_change_requests_status_chk CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS company_change_requests_company_idx
  ON company_change_requests (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS company_change_requests_status_idx
  ON company_change_requests (status, created_at DESC);
