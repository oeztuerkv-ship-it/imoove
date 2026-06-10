-- Kunden-Storno-Sperre: nach 4 Stornos in 24h → 24h Buchungssperre (passenger_id-Ebene).
CREATE TABLE IF NOT EXISTS customer_cancellation_suspension (
  passenger_id TEXT PRIMARY KEY,
  suspended_until TIMESTAMPTZ NOT NULL,
  suspended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT NOT NULL DEFAULT 'too_many_cancellations',
  lifted_at TIMESTAMPTZ,
  lifted_by_admin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_cancellation_suspension_until_idx
  ON customer_cancellation_suspension (suspended_until DESC);
