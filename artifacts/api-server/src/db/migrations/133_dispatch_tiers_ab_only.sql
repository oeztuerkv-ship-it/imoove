-- Dispatch-Tiers: nur noch A und B (C entfällt). Neue Fahrer → B. Auto-A-E-Mail entfällt im Code.

UPDATE fleet_drivers
SET dispatch_priority = 'B'
WHERE upper(trim(dispatch_priority)) = 'C'
   OR upper(trim(dispatch_priority)) NOT IN ('A', 'B');

UPDATE rides
SET dispatch_tier = 'B'
WHERE upper(trim(dispatch_tier)) = 'C'
   OR upper(trim(dispatch_tier)) NOT IN ('A', 'B');

ALTER TABLE fleet_drivers
  ALTER COLUMN dispatch_priority SET DEFAULT 'B';

ALTER TABLE fleet_drivers DROP CONSTRAINT IF EXISTS fleet_drivers_dispatch_priority_chk;
ALTER TABLE fleet_drivers
  ADD CONSTRAINT fleet_drivers_dispatch_priority_chk
  CHECK (dispatch_priority IN ('A', 'B'));

ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_dispatch_tier_chk;
ALTER TABLE rides
  ADD CONSTRAINT rides_dispatch_tier_chk
  CHECK (dispatch_tier IN ('A', 'B'));

COMMENT ON COLUMN fleet_drivers.dispatch_priority IS
  'Premium-Dispatch: A (manuell Admin) oder B (Standard für neue Fahrer).';
COMMENT ON COLUMN rides.dispatch_tier IS
  'Aktuelle Angebots-Stufe für Sofortfahrten/offene Reservierung (A→B).';
COMMENT ON COLUMN fleet_drivers.dispatch_reject_streak IS
  'Aufeinanderfolgende Markt-Ablehnungen; bei 20 → Priorität A→B (Ende).';
