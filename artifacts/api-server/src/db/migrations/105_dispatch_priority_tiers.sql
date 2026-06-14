-- Premium-Fahrer: Dispatch-Stufen A → B → C (Sofortfahrten)

ALTER TABLE fleet_drivers
  ADD COLUMN IF NOT EXISTS dispatch_priority TEXT NOT NULL DEFAULT 'C';

ALTER TABLE fleet_drivers DROP CONSTRAINT IF EXISTS fleet_drivers_dispatch_priority_chk;
ALTER TABLE fleet_drivers
  ADD CONSTRAINT fleet_drivers_dispatch_priority_chk
  CHECK (dispatch_priority IN ('A', 'B', 'C'));

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS dispatch_tier TEXT NOT NULL DEFAULT 'A';

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS dispatch_tier_started_at TIMESTAMPTZ;

ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_dispatch_tier_chk;
ALTER TABLE rides
  ADD CONSTRAINT rides_dispatch_tier_chk
  CHECK (dispatch_tier IN ('A', 'B', 'C'));

CREATE INDEX IF NOT EXISTS rides_dispatch_tier_open_idx
  ON rides (dispatch_tier, dispatch_tier_started_at)
  WHERE driver_id IS NULL
    AND status IN ('pending', 'requested', 'searching_driver', 'offered');

COMMENT ON COLUMN fleet_drivers.dispatch_priority IS 'Premium-Dispatch: A (zuerst), B, C — nur Admin.';
COMMENT ON COLUMN rides.dispatch_tier IS 'Aktuelle Angebots-Stufe für Sofortfahrten (A→B→C).';
COMMENT ON COLUMN rides.dispatch_tier_started_at IS 'Start der aktuellen Stufe (Timeout-Basis).';

-- Plattform-Admin / Vedat: automatisch Priorität A
UPDATE fleet_drivers fd
SET dispatch_priority = 'A'
WHERE dispatch_priority <> 'A'
  AND (
    lower(trim(fd.email)) IN (SELECT lower(trim(email)) FROM admin_auth_users WHERE email IS NOT NULL AND trim(email) <> '')
    OR lower(trim(fd.email)) LIKE '%vedat%'
  );
