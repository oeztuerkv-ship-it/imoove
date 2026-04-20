ALTER TABLE ride_financials
  ADD COLUMN IF NOT EXISTS calculation_rule_set TEXT,
  ADD COLUMN IF NOT EXISTS calculation_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS lock_reason TEXT,
  ADD COLUMN IF NOT EXISTS correction_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_correction_at TIMESTAMPTZ;

ALTER TABLE ride_financials
  ALTER COLUMN billing_status SET DEFAULT 'unbilled',
  ALTER COLUMN settlement_status SET DEFAULT 'open';

UPDATE ride_financials
SET billing_status = CASE billing_status
  WHEN 'open' THEN 'unbilled'
  WHEN 'credited' THEN 'written_off'
  ELSE billing_status
END
WHERE billing_status IN ('open', 'credited');

UPDATE ride_financials
SET settlement_status = CASE settlement_status
  WHEN 'pending' THEN 'open'
  WHEN 'included' THEN 'calculated'
  WHEN 'settled' THEN 'approved'
  WHEN 'paid' THEN 'paid_out'
  WHEN 'hold' THEN 'held'
  WHEN 'cancelled' THEN 'disputed'
  ELSE settlement_status
END
WHERE settlement_status IN ('pending', 'included', 'settled', 'paid', 'hold', 'cancelled');

ALTER TABLE ride_financials
  DROP CONSTRAINT IF EXISTS ride_financials_billing_status_chk;
ALTER TABLE ride_financials
  ADD CONSTRAINT ride_financials_billing_status_chk
  CHECK (billing_status IN ('unbilled', 'queued', 'invoiced', 'partially_paid', 'paid', 'cancelled', 'written_off'));

ALTER TABLE ride_financials
  DROP CONSTRAINT IF EXISTS ride_financials_settlement_status_chk;
ALTER TABLE ride_financials
  ADD CONSTRAINT ride_financials_settlement_status_chk
  CHECK (settlement_status IN ('open', 'calculated', 'approved', 'paid_out', 'held', 'disputed'));
