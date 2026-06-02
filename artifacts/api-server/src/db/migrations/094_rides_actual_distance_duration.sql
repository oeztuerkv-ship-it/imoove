-- Migration 094: actual_distance_km + actual_duration_minutes auf rides
-- Speichert gefahrene km und echte Fahrtdauer (vom Fahrer beim Complete gesendet)
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS actual_distance_km double precision,
  ADD COLUMN IF NOT EXISTS actual_duration_minutes integer;

COMMENT ON COLUMN rides.actual_distance_km IS 'Vom Fahrer beim Abschluss gemeldete gefahrene Strecke (Navi/Taxameter)';
COMMENT ON COLUMN rides.actual_duration_minutes IS 'Vom Fahrer beim Abschluss gemeldete tatsächliche Fahrtdauer in Minuten';
