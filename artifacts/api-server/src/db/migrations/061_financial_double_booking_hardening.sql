-- Financial double-booking protection: settlement ↔ ride linkage, idempotency, payout dedupe.
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS settlements_idempotency_key_unique
  ON settlements (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND length(trim(idempotency_key)) > 0;

CREATE TABLE IF NOT EXISTS settlement_ride_allocations (
  settlement_id TEXT NOT NULL REFERENCES settlements (id) ON DELETE CASCADE,
  ride_id TEXT NOT NULL REFERENCES rides (id) ON DELETE CASCADE,
  ride_financial_id TEXT NOT NULL REFERENCES ride_financials (id) ON DELETE CASCADE,
  gross_amount_snap DOUBLE PRECISION NOT NULL DEFAULT 0,
  commission_amount_snap DOUBLE PRECISION NOT NULL DEFAULT 0,
  operator_payout_snap DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (settlement_id, ride_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS settlement_ride_allocations_one_ride_global
  ON settlement_ride_allocations (ride_id);

CREATE INDEX IF NOT EXISTS settlement_ride_allocations_settlement_idx
  ON settlement_ride_allocations (settlement_id, created_at DESC);

-- Max. eine „offene“ Auszahlung pro Settlement (pending/booked); nach failed/cancelled/reversed erneut möglich.
CREATE UNIQUE INDEX IF NOT EXISTS payments_settlement_single_open
  ON payments (target_id)
  WHERE target_type = 'settlement' AND status IN ('pending', 'booked');
