-- Trio A → Pool-Runde 1 → Pool-Runde 2 → Open-Market (je 10 s Timeout auf Phase).
-- fleet_drivers.dispatch_priority bleibt A (Trio A) | B (Pool).
-- rides.dispatch_tier bleibt A|B (Sichtbarkeit); rides.dispatch_phase steuert die Eskalation.

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS dispatch_phase TEXT NOT NULL DEFAULT 'trio_a';

-- Bestehende offene B-Fahrten: bereits eskaliert → open; A → trio_a.
UPDATE rides
SET dispatch_phase = CASE
  WHEN upper(trim(dispatch_tier)) = 'B' THEN 'open'
  ELSE 'trio_a'
END
WHERE dispatch_phase IS NULL
   OR trim(dispatch_phase) = ''
   OR lower(trim(dispatch_phase)) NOT IN ('trio_a', 'pool_1', 'pool_2', 'open');

ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_dispatch_phase_chk;
ALTER TABLE rides
  ADD CONSTRAINT rides_dispatch_phase_chk
  CHECK (dispatch_phase IN ('trio_a', 'pool_1', 'pool_2', 'open'));

COMMENT ON COLUMN rides.dispatch_phase IS
  'Market-Eskalation: trio_a (10s) → pool_1 (10s) → pool_2 (10s) → open (Markt bis Expiry).';
COMMENT ON COLUMN rides.dispatch_tier IS
  'Sichtbarkeit: A = nur Trio-A-Fahrer; B = Pool (Phasen pool_1/pool_2/open).';
COMMENT ON COLUMN fleet_drivers.dispatch_priority IS
  'Trio A (manuell Admin) oder Pool B (Default für neue Fahrer).';
