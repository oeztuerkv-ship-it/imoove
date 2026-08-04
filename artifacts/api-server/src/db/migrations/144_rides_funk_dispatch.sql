-- Funk-Dispatch: exclusive sequential assignment (no market pool / tier A/B)
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS dispatch_mode text NOT NULL DEFAULT 'market';

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS offered_to_driver_id text;

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS funk_offer_started_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rides_dispatch_mode_chk'
  ) THEN
    ALTER TABLE rides
      ADD CONSTRAINT rides_dispatch_mode_chk
      CHECK (dispatch_mode IN ('market', 'funk'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rides_funk_offer_active_idx
  ON rides (dispatch_mode, status, funk_offer_started_at)
  WHERE dispatch_mode = 'funk';
