CREATE TABLE IF NOT EXISTS billing_accounts (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES admin_companies (id) ON DELETE CASCADE,
  account_role TEXT NOT NULL DEFAULT 'partner',
  account_name TEXT NOT NULL DEFAULT '',
  billing_email TEXT NOT NULL DEFAULT '',
  billing_address_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  payment_terms_days INTEGER NOT NULL DEFAULT 14,
  settlement_interval TEXT NOT NULL DEFAULT 'monthly',
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_accounts_role_chk
    CHECK (account_role IN ('partner', 'operator', 'payer', 'provider')),
  CONSTRAINT billing_accounts_settlement_interval_chk
    CHECK (settlement_interval IN ('weekly', 'biweekly', 'monthly', 'custom'))
);

CREATE INDEX IF NOT EXISTS billing_accounts_company_role_idx
  ON billing_accounts (company_id, account_role, is_active);

CREATE TABLE IF NOT EXISTS ride_financials (
  id TEXT PRIMARY KEY,
  ride_id TEXT NOT NULL REFERENCES rides (id) ON DELETE CASCADE,
  payer_type TEXT NOT NULL,
  billing_mode TEXT NOT NULL,
  service_provider_company_id TEXT REFERENCES admin_companies (id) ON DELETE SET NULL,
  partner_company_id TEXT REFERENCES admin_companies (id) ON DELETE SET NULL,
  billing_reference TEXT NOT NULL DEFAULT '',
  gross_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  net_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  vat_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  vat_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  commission_type TEXT NOT NULL DEFAULT 'percentage',
  commission_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  commission_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  operator_payout_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  billing_status TEXT NOT NULL DEFAULT 'unbilled',
  settlement_status TEXT NOT NULL DEFAULT 'open',
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  calculation_version TEXT NOT NULL DEFAULT 'v1',
  calculation_rule_set TEXT,
  calculation_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  locked_at TIMESTAMPTZ,
  lock_reason TEXT,
  correction_count INTEGER NOT NULL DEFAULT 0,
  last_correction_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ride_financials_ride_unique UNIQUE (ride_id),
  CONSTRAINT ride_financials_payer_type_chk
    CHECK (payer_type IN ('passenger', 'hotel', 'company', 'insurance', 'voucher', 'third_party')),
  CONSTRAINT ride_financials_billing_mode_chk
    CHECK (billing_mode IN ('direct', 'invoice', 'voucher', 'insurance', 'manual')),
  CONSTRAINT ride_financials_commission_type_chk
    CHECK (commission_type IN ('percentage', 'fixed', 'hybrid', 'none')),
  CONSTRAINT ride_financials_billing_status_chk
    CHECK (billing_status IN ('unbilled', 'queued', 'invoiced', 'partially_paid', 'paid', 'cancelled', 'written_off')),
  CONSTRAINT ride_financials_settlement_status_chk
    CHECK (settlement_status IN ('open', 'calculated', 'approved', 'paid_out', 'held', 'disputed'))
);

CREATE INDEX IF NOT EXISTS ride_financials_partner_company_idx
  ON ride_financials (partner_company_id, billing_status, calculated_at DESC);
CREATE INDEX IF NOT EXISTS ride_financials_provider_company_idx
  ON ride_financials (service_provider_company_id, settlement_status, calculated_at DESC);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  company_id TEXT REFERENCES admin_companies (id) ON DELETE SET NULL,
  invoice_type TEXT NOT NULL,
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  subtotal_net DOUBLE PRECISION NOT NULL DEFAULT 0,
  vat_total DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_gross DOUBLE PRECISION NOT NULL DEFAULT 0,
  issue_date DATE NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  pdf_storage_key TEXT NOT NULL DEFAULT '',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoices_type_chk
    CHECK (invoice_type IN ('partner_invoice', 'operator_settlement', 'credit_note')),
  CONSTRAINT invoices_status_chk
    CHECK (status IN ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS invoices_company_period_idx
  ON invoices (company_id, billing_period_start, billing_period_end, status);

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  ride_id TEXT REFERENCES rides (id) ON DELETE SET NULL,
  item_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  quantity DOUBLE PRECISION NOT NULL DEFAULT 1,
  unit_net DOUBLE PRECISION NOT NULL DEFAULT 0,
  vat_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  line_net DOUBLE PRECISION NOT NULL DEFAULT 0,
  line_vat DOUBLE PRECISION NOT NULL DEFAULT 0,
  line_gross DOUBLE PRECISION NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx
  ON invoice_items (invoice_id, created_at);
CREATE INDEX IF NOT EXISTS invoice_items_ride_idx
  ON invoice_items (ride_id);

CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  settlement_number TEXT NOT NULL UNIQUE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_revenue DOUBLE PRECISION NOT NULL DEFAULT 0,
  platform_commission DOUBLE PRECISION NOT NULL DEFAULT 0,
  adjustments DOUBLE PRECISION NOT NULL DEFAULT 0,
  payout_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  paid_at TIMESTAMPTZ,
  payment_reference TEXT NOT NULL DEFAULT '',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT settlements_status_chk
    CHECK (status IN ('draft', 'issued', 'approved', 'paid', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS settlements_company_period_idx
  ON settlements (company_id, period_start, period_end, status);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  company_id TEXT REFERENCES admin_companies (id) ON DELETE SET NULL,
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  reference TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payments_target_type_chk
    CHECK (target_type IN ('invoice', 'settlement', 'ride_financial', 'other')),
  CONSTRAINT payments_status_chk
    CHECK (status IN ('pending', 'booked', 'failed', 'reversed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS payments_target_idx
  ON payments (target_type, target_id, status);
CREATE INDEX IF NOT EXISTS payments_company_paid_idx
  ON payments (company_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS financial_audit_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  old_value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS financial_audit_log_entity_idx
  ON financial_audit_log (entity_type, entity_id, created_at DESC);
