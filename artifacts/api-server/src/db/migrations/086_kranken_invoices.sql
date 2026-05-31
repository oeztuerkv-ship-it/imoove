-- Krankenfahrten-Sammelrechnungen (Taxi → Krankenkasse, ONRODA Provision aus admin_companies.commission_rate).

ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS insurer_billing_contacts_json JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN admin_companies.insurer_billing_contacts_json IS
  'Vorlagen [{insurerName, insurerIk, email}] für Krankenkassen-Abrechnung im Partner-/Admin-Panel.';

CREATE TABLE IF NOT EXISTS kranken_invoices (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  insurer_name TEXT NOT NULL DEFAULT '',
  insurer_ik TEXT NOT NULL DEFAULT '',
  insurer_email TEXT NOT NULL DEFAULT '',
  invoice_number TEXT NOT NULL,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  total_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  commission_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  net_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  commission_rate_snap DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  sent_to TEXT NOT NULL DEFAULT '',
  paid_at TIMESTAMPTZ,
  pdf_storage_key TEXT NOT NULL DEFAULT '',
  ride_count INTEGER NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT kranken_invoices_status_chk CHECK (status IN ('draft', 'sent', 'paid')),
  CONSTRAINT kranken_invoices_number_uq UNIQUE (invoice_number)
);

CREATE INDEX IF NOT EXISTS kranken_invoices_company_created_idx
  ON kranken_invoices (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS kranken_invoices_status_idx
  ON kranken_invoices (status);

CREATE TABLE IF NOT EXISTS kranken_invoice_sequences (
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  next_seq INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (company_id, year)
);

ALTER TABLE transport_vouchers
  DROP CONSTRAINT IF EXISTS transport_vouchers_kranken_invoice_fk;

ALTER TABLE transport_vouchers
  ADD CONSTRAINT transport_vouchers_kranken_invoice_fk
  FOREIGN KEY (kranken_invoice_id) REFERENCES kranken_invoices (id) ON DELETE SET NULL;

COMMENT ON TABLE kranken_invoices IS
  'Sammelrechnung Krankenkasse pro Mandant/Zeitraum; PDF + optional Versand per SMTP.';
