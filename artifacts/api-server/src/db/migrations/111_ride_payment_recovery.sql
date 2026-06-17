-- Fehlgeschlagene Kartenabbuchung: Retry-Zeitplan, Kunden-Sperre bei offener Zahlung.

ALTER TABLE rides ADD COLUMN IF NOT EXISTS payment_capture_attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS payment_capture_last_attempt_at TIMESTAMPTZ NULL;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS payment_capture_next_retry_at TIMESTAMPTZ NULL;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS payment_capture_last_error TEXT NULL;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS payment_failed_notified_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS rides_payment_failed_retry_idx
  ON rides (payment_capture_next_retry_at)
  WHERE payment_status = 'failed' AND status = 'completed';

COMMENT ON COLUMN rides.payment_capture_attempt_count IS 'Anzahl Capture-Versuche (initial + Cron-Retries).';
COMMENT ON COLUMN rides.payment_capture_next_retry_at IS 'Nächster automatischer Retry (NULL = keine weiteren Versuche).';

CREATE TABLE IF NOT EXISTS customer_payment_suspension (
  passenger_id TEXT PRIMARY KEY,
  outstanding_ride_id TEXT REFERENCES rides (id) ON DELETE SET NULL,
  suspended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT NOT NULL DEFAULT 'unpaid_ride',
  lifted_at TIMESTAMPTZ,
  lifted_by_admin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_payment_suspension_active_idx
  ON customer_payment_suspension (suspended_at DESC)
  WHERE lifted_at IS NULL;
