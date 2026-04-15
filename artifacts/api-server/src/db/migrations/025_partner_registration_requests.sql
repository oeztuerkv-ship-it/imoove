CREATE TABLE IF NOT EXISTS partner_registration_requests (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  legal_form TEXT NOT NULL DEFAULT '',
  partner_type TEXT NOT NULL,
  uses_vouchers BOOLEAN NOT NULL DEFAULT FALSE,
  contact_first_name TEXT NOT NULL DEFAULT '',
  contact_last_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  address_line1 TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  vat_id TEXT NOT NULL DEFAULT '',
  concession_number TEXT NOT NULL DEFAULT '',
  desired_region TEXT NOT NULL DEFAULT '',
  requested_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  documents_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  registration_status TEXT NOT NULL DEFAULT 'open',
  verification_status TEXT NOT NULL DEFAULT 'pending',
  compliance_status TEXT NOT NULL DEFAULT 'pending',
  contract_status TEXT NOT NULL DEFAULT 'inactive',
  missing_documents_note TEXT NOT NULL DEFAULT '',
  admin_note TEXT NOT NULL DEFAULT '',
  master_data_locked BOOLEAN NOT NULL DEFAULT TRUE,
  linked_company_id TEXT REFERENCES admin_companies (id) ON DELETE SET NULL,
  reviewed_by_admin_user_id TEXT REFERENCES admin_auth_users (id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_registration_requests_status_chk
    CHECK (registration_status IN ('open', 'in_review', 'documents_required', 'approved', 'rejected', 'blocked')),
  CONSTRAINT partner_registration_requests_partner_type_chk
    CHECK (partner_type IN ('taxi', 'hotel', 'insurance', 'medical', 'care', 'business', 'voucher_partner', 'other')),
  CONSTRAINT partner_registration_requests_verification_chk
    CHECK (verification_status IN ('pending', 'in_review', 'verified', 'rejected')),
  CONSTRAINT partner_registration_requests_compliance_chk
    CHECK (compliance_status IN ('pending', 'complete', 'missing_documents', 'rejected')),
  CONSTRAINT partner_registration_requests_contract_chk
    CHECK (contract_status IN ('inactive', 'pending', 'active', 'suspended', 'terminated'))
);

CREATE INDEX IF NOT EXISTS partner_registration_requests_status_created_idx
  ON partner_registration_requests (registration_status, created_at DESC);

CREATE INDEX IF NOT EXISTS partner_registration_requests_email_created_idx
  ON partner_registration_requests (lower(email), created_at DESC);
