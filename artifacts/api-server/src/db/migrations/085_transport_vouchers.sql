-- T-Schein / Krankenfahrt: Abrechnungsbelege pro Fahrt (Option B — Taxi rechnet ab, ONRODA dokumentiert).

CREATE TABLE IF NOT EXISTS transport_vouchers (
  id TEXT PRIMARY KEY,
  ride_id TEXT NOT NULL REFERENCES rides (id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  patient_name TEXT NOT NULL DEFAULT '',
  insurer_name TEXT NOT NULL DEFAULT '',
  insurer_ik TEXT NOT NULL DEFAULT '',
  insurer_email TEXT NOT NULL DEFAULT '',
  fare_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  commission_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  net_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  commission_rate_snap DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  kranken_invoice_id TEXT,
  billed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  ride_reference_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transport_vouchers_status_chk CHECK (status IN ('open', 'billed', 'paid')),
  CONSTRAINT transport_vouchers_ride_uq UNIQUE (ride_id)
);

CREATE INDEX IF NOT EXISTS transport_vouchers_company_status_idx
  ON transport_vouchers (company_id, status);

CREATE INDEX IF NOT EXISTS transport_vouchers_insurer_idx
  ON transport_vouchers (company_id, lower(insurer_name), insurer_ik);

CREATE INDEX IF NOT EXISTS transport_vouchers_invoice_idx
  ON transport_vouchers (kranken_invoice_id)
  WHERE kranken_invoice_id IS NOT NULL;

COMMENT ON TABLE transport_vouchers IS
  'Krankenfahrt T-Schein-Beleg je Fahrt; Sammelrechnung bündelt open→billed.';
