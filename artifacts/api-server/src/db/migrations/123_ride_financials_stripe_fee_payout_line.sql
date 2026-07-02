-- Stripe-Gebühr (ONRODA-Last) + manueller Auszahlungsstatus pro Fahrt.

ALTER TABLE ride_financials
  ADD COLUMN IF NOT EXISTS stripe_fee_amount DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE ride_financials
  ADD COLUMN IF NOT EXISTS payout_line_status TEXT NOT NULL DEFAULT 'offen';

ALTER TABLE ride_financials
  DROP CONSTRAINT IF EXISTS ride_financials_payout_line_status_chk;

ALTER TABLE ride_financials
  ADD CONSTRAINT ride_financials_payout_line_status_chk
  CHECK (payout_line_status IN ('offen', 'ausgezahlt'));

CREATE INDEX IF NOT EXISTS ride_financials_payout_line_status_idx
  ON ride_financials (payout_line_status, calculated_at DESC);

COMMENT ON COLUMN ride_financials.stripe_fee_amount IS
  'Stripe-Gebühr in EUR (Plattform-Last; reduziert operator_payout_amount nicht).';
COMMENT ON COLUMN ride_financials.payout_line_status IS
  'Manuelle Auszahlung an Unternehmer: offen | ausgezahlt.';
