-- Temporäre Reservierungs-Sperre für Fahrer (24h wenn Aktivierung verpasst)
ALTER TABLE fleet_drivers ADD COLUMN IF NOT EXISTS reservation_suspended_until TIMESTAMPTZ NULL;

COMMENT ON COLUMN fleet_drivers.reservation_suspended_until IS 
  'Temporäre Sperre: Fahrer hat Reservierung nicht rechtzeitig aktiviert. Bis zu diesem Zeitpunkt keine Reservierungen + keine Live-Fahrten.';
