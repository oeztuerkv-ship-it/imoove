-- Korrektur-Ledger: gelabelte Finanz-Korrekturen (Refund, Chargeback, manuell) mit Bezug zur Ursprungsfahrt.

CREATE TABLE IF NOT EXISTS ride_financial_adjustments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  ride_id TEXT NOT NULL REFERENCES rides (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  gross_delta DOUBLE PRECISION NOT NULL DEFAULT 0,
  commission_delta DOUBLE PRECISION NOT NULL DEFAULT 0,
  operator_payout_delta DOUBLE PRECISION NOT NULL DEFAULT 0,
  stripe_fee_delta DOUBLE PRECISION NOT NULL DEFAULT 0,
  tip_delta DOUBLE PRECISION NOT NULL DEFAULT 0,
  payment_method_snap TEXT NOT NULL DEFAULT '',
  external_ref TEXT NOT NULL DEFAULT '',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ride_financial_adjustments DROP CONSTRAINT IF EXISTS ride_financial_adjustments_kind_chk;
ALTER TABLE ride_financial_adjustments
  ADD CONSTRAINT ride_financial_adjustments_kind_chk
  CHECK (kind IN ('refund', 'chargeback', 'manual_credit', 'manual_debit', 'cancel_fee', 'no_show_fee'));

CREATE INDEX IF NOT EXISTS ride_financial_adjustments_company_created_idx
  ON ride_financial_adjustments (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ride_financial_adjustments_ride_idx
  ON ride_financial_adjustments (ride_id, created_at DESC);

-- Idempotenz: gleicher Stripe-/Extern-Bezug nicht doppelt (leerer external_ref erlaubt Mehrfach manuell).
CREATE UNIQUE INDEX IF NOT EXISTS ride_financial_adjustments_ride_kind_ext_uidx
  ON ride_financial_adjustments (ride_id, kind, external_ref)
  WHERE length(trim(external_ref)) > 0;

COMMENT ON TABLE ride_financial_adjustments IS
  'Finanz-Korrekturen (Refund/Chargeback/manuell); Saldo = ride_financials + Summe Adjustments.';
COMMENT ON COLUMN ride_financial_adjustments.operator_payout_delta IS
  'Delta auf Unternehmer-Netting (Bar negativ / Karte positiv); Refund typisch Umkehr des Snapshots.';
